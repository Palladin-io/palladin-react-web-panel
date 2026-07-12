import { useMutation } from '@tanstack/react-query'
import { deriveKey } from '../../../shared/crypto/argon2'
import { fromBase64, toBase64 } from '../../../shared/crypto/encoding'
import { decryptWithKey, wipe } from '../../../shared/crypto/sodium'
import { getAccount } from '../../../shared/api/account-api'
import type { AuthResponse } from '../../../shared/api/types'
import {
  fetchLoginSalt,
  isTotpRequired,
  passwordLogin,
  totpLogin,
} from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'

/**
 * Establish the session from a successful login response and unlock the vault.
 *
 * After the server returns tokens we still need to derive the master key
 * locally (the password never went to the server as MK — only as authHash), so
 * we fetch the account crypto material, re-derive MK from `password + salt`,
 * decrypt the private key, and hand both to the store. All key material is
 * zeroed before returning.
 */
async function establishSession(response: AuthResponse, password: string): Promise<void> {
  useAuthStore.getState().setTokens(response)

  const account = await getAccount()
  if (!account.salt || !account.encryptedPrivateKey) {
    // Tokens are set but there's no key material to unlock with — the vault
    // stays locked and the guard routes to /unlock. Should not happen for a
    // password account, whose material is written at registration.
    return
  }

  const masterKey = await deriveKey(password, fromBase64(account.salt))
  let privateKey: Uint8Array | null = null
  try {
    privateKey = await decryptWithKey(fromBase64(account.encryptedPrivateKey), masterKey)
    useAuthStore.getState().unlockVault(masterKey, privateKey)
  } finally {
    if (privateKey) wipe(privateKey)
    wipe(masterKey)
  }
}

export type LoginStartResult =
  | { kind: 'done' }
  | { kind: 'totp'; challengeToken: string }

/**
 * Drives the email+password login handshake:
 *   1. fetch the account's authSalt (anti-enumeration: unknown emails still
 *      return a deterministic salt)
 *   2. derive authHash = Argon2id(password, authSalt) — wiped right after
 *   3. POST authHash to login
 *   4. either finish (derive MK, unlock) or surface a TOTP challenge
 *
 * The caller retains the password in component state only for as long as the
 * TOTP step needs it (to derive MK once the second factor clears), then it is
 * dropped when the login screen unmounts.
 */
export function usePasswordLogin() {
  const start = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }): Promise<LoginStartResult> => {
      const { authSalt } = await fetchLoginSalt(email)
      const authHash = await deriveKey(password, fromBase64(authSalt))
      try {
        const response = await passwordLogin({ email, authHash: toBase64(authHash) })
        if (isTotpRequired(response)) {
          return { kind: 'totp', challengeToken: response.challengeToken }
        }
        await establishSession(response, password)
        return { kind: 'done' }
      } finally {
        wipe(authHash)
      }
    },
  })

  const submitTotp = useMutation({
    mutationFn: async ({
      challengeToken,
      code,
      password,
    }: {
      challengeToken: string
      code: string
      password: string
    }): Promise<void> => {
      const response = await totpLogin({ challengeToken, code: code.trim() })
      await establishSession(response, password)
    },
  })

  return { start, submitTotp }
}
