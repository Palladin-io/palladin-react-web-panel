import { useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  assertIdentityKdfProfile,
  deriveIdentityV1,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_SECURITY_VERSION,
} from '../../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, wipe } from '../../../shared/crypto/sodium'
import { getAccount, type AccountResponse } from '../../../shared/api/account-api'
import type { AuthResponse } from '../../../shared/api/types'
import {
  fetchLoginKdf,
  isTotpRequired,
  passwordLogin,
  totpLogin,
  type LoginKdfBootstrap,
} from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'
import { clearClientSession } from '../session/client-session'

interface PendingV2Unlock {
  masterKey: Uint8Array
  bootstrap: LoginKdfBootstrap
}

function assertAuthenticatedV2Account(
  account: AccountResponse,
  bootstrap: LoginKdfBootstrap,
): void {
  if (!account.kdf
    || account.userId !== bootstrap.accountId
    || account.kdf.securityVersion !== IDENTITY_SECURITY_VERSION
    || account.kdf.minimumSecurityVersion > IDENTITY_SECURITY_VERSION
    || account.kdf.profileId !== IDENTITY_KDF_PROFILE_ID
    || account.kdf.kdfSalt !== bootstrap.kdfSalt) {
    throw new Error('security-version-downgrade')
  }
  assertIdentityKdfProfile({
    ...account.kdf,
    memoryKiB: bootstrap.memoryKiB,
    iterations: bootstrap.iterations,
    parallelism: bootstrap.parallelism,
  })
}

async function unlockWithMasterKey(
  response: AuthResponse,
  masterKey: Uint8Array,
  bootstrap?: LoginKdfBootstrap,
): Promise<AccountResponse> {
  useAuthStore.getState().setTokens(response)
  try {
    const account = await getAccount()
    if (!account.encryptedPrivateKey) throw new Error('Account key material is missing')
    if (bootstrap) assertAuthenticatedV2Account(account, bootstrap)

    const encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
    let privateKey: Uint8Array | null = null
    try {
      privateKey = await decryptWithKey(encryptedPrivateKey, masterKey)
      useAuthStore.getState().unlockVault(masterKey, privateKey)
      return account
    } finally {
      wipe(encryptedPrivateKey)
      if (privateKey) wipe(privateKey)
    }
  } catch (error) {
    await clearClientSession()
    throw error
  }
}

export type LoginStartResult =
  | { kind: 'done' }
  | { kind: 'totp'; challengeToken: string }

export function usePasswordLogin() {
  const pendingV2 = useRef<PendingV2Unlock | null>(null)

  const clearPendingV2 = () => {
    if (!pendingV2.current) return
    wipe(pendingV2.current.masterKey)
    pendingV2.current = null
  }

  useEffect(() => () => clearPendingV2(), [])

  const start = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }): Promise<LoginStartResult> => {
      clearPendingV2()
      const bootstrap = await fetchLoginKdf(email, IDENTITY_KDF_PROFILE_ID)
      assertIdentityKdfProfile(bootstrap)
      const kdfSalt = decodeBase64Url(bootstrap.kdfSalt, 16)
      const identity = await deriveIdentityV1(
        password,
        bootstrap.accountId,
        kdfSalt,
      )
      try {
        const response = await passwordLogin({
          email,
          securityVersion: IDENTITY_SECURITY_VERSION,
          kdfProfileId: IDENTITY_KDF_PROFILE_ID,
          authCredential: encodeBase64Url(identity.authCredential),
        })
        if (isTotpRequired(response)) {
          pendingV2.current = {
            masterKey: new Uint8Array(identity.masterKey),
            bootstrap,
          }
          return { kind: 'totp', challengeToken: response.challengeToken }
        }
        await unlockWithMasterKey(
          response,
          identity.masterKey,
          bootstrap,
        )
        return { kind: 'done' }
      } finally {
        wipe(kdfSalt)
        wipe(identity.authCredential)
        wipe(identity.masterKey)
      }
    },
  })

  const submitTotp = useMutation({
    mutationFn: async ({
      challengeToken,
      code,
    }: {
      challengeToken: string
      code: string
    }): Promise<void> => {
      const response = await totpLogin({ challengeToken, code: code.trim() })
      if (!pendingV2.current) throw new Error('Missing pending login state')

      const pending = pendingV2.current
      try {
        await unlockWithMasterKey(
          response,
          pending.masterKey,
          pending.bootstrap,
        )
      } finally {
        clearPendingV2()
      }
    },
  })

  return { start, submitTotp }
}
