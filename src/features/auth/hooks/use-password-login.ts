import { useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { deriveKey } from '../../../shared/crypto/argon2'
import {
  assertIdentityKdfProfile,
  decodeAccountSecret,
  deriveIdentityV2,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_SECURITY_VERSION,
  LEGACY_IDENTITY_KDF_PROFILE_ID,
} from '../../../shared/crypto/identity-kdf'
import { fromBase64, toBase64 } from '../../../shared/crypto/encoding'
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

interface PendingV2Unlock {
  masterKey: Uint8Array
  accountSecret: Uint8Array
  bootstrap: LoginKdfBootstrap & { accountId: string }
}

function decodeLegacyBase64(value: string, maximumBytes: number, exactBytes?: number): Uint8Array {
  if (value.length > Math.ceil(maximumBytes / 3) * 4) throw new Error('legacy base64 payload exceeds limit')
  const decoded = fromBase64(value)
  if (decoded.length > maximumBytes || (exactBytes !== undefined && decoded.length !== exactBytes)
    || toBase64(decoded) !== value) {
    wipe(decoded)
    throw new Error('invalid canonical legacy base64')
  }
  return decoded
}

function assertAuthenticatedV2Account(
  account: AccountResponse,
  bootstrap: LoginKdfBootstrap & { accountId: string },
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
    accountSecretRequired: bootstrap.accountSecretRequired,
  })
}

async function unlockWithMasterKey(
  response: AuthResponse,
  masterKey: Uint8Array,
  accountSecret?: Uint8Array,
  bootstrap?: LoginKdfBootstrap & { accountId: string },
  legacyEncoding = false,
): Promise<AccountResponse> {
  useAuthStore.getState().setTokens(response)
  try {
    const account = await getAccount()
    if (!account.encryptedPrivateKey) throw new Error('Account key material is missing')
    if (bootstrap) assertAuthenticatedV2Account(account, bootstrap)

    const encryptedPrivateKey = legacyEncoding
      ? decodeLegacyBase64(account.encryptedPrivateKey, 4096)
      : decodeBase64Url(account.encryptedPrivateKey, 4096)
    let privateKey: Uint8Array | null = null
    try {
      privateKey = await decryptWithKey(encryptedPrivateKey, masterKey)
      useAuthStore.getState().unlockVault(masterKey, privateKey, accountSecret)
      return account
    } finally {
      wipe(encryptedPrivateKey)
      if (privateKey) wipe(privateKey)
    }
  } catch (error) {
    useAuthStore.getState().logout()
    throw error
  }
}

async function establishLegacySession(
  response: AuthResponse,
  password: string,
): Promise<AccountResponse> {
  useAuthStore.getState().setTokens(response)
  let salt: Uint8Array | null = null
  let masterKey: Uint8Array | null = null
  try {
    const account = await getAccount()
    if (!account.salt || !account.encryptedPrivateKey || !account.kdf
      || account.kdf.securityVersion !== 1
      || account.kdf.minimumSecurityVersion > 1
      || account.kdf.profileId !== LEGACY_IDENTITY_KDF_PROFILE_ID) {
      throw new Error('security-version-downgrade')
    }
    salt = decodeLegacyBase64(account.salt, 16, 16)
    masterKey = await deriveKey(password, salt)
    return await unlockWithMasterKey(response, masterKey, undefined, undefined, true)
  } catch (error) {
    useAuthStore.getState().logout()
    throw error
  } finally {
    if (salt) wipe(salt)
    if (masterKey) wipe(masterKey)
  }
}

export type LoginStartResult =
  | { kind: 'done'; legacyAccount: AccountResponse | null }
  | { kind: 'totp'; challengeToken: string }

export function usePasswordLogin() {
  const pendingV2 = useRef<PendingV2Unlock | null>(null)

  const clearPendingV2 = () => {
    if (!pendingV2.current) return
    wipe(pendingV2.current.masterKey)
    wipe(pendingV2.current.accountSecret)
    pendingV2.current = null
  }

  useEffect(() => () => clearPendingV2(), [])

  const start = useMutation({
    mutationFn: async ({
      email,
      password,
      accountSecret: encodedAccountSecret,
    }: {
      email: string
      password: string
      accountSecret?: string
    }): Promise<LoginStartResult> => {
      clearPendingV2()
      const usesV2 = encodedAccountSecret?.trim().length

      if (!usesV2) {
        const bootstrap = await fetchLoginKdf(email, LEGACY_IDENTITY_KDF_PROFILE_ID)
        const salt = decodeBase64Url(bootstrap.kdfSalt, 16)
        const authCredential = await deriveKey(password, salt)
        try {
          const response = await passwordLogin({
            email,
            securityVersion: 1,
            kdfProfileId: LEGACY_IDENTITY_KDF_PROFILE_ID,
            authCredential: encodeBase64Url(authCredential),
          })
          if (isTotpRequired(response)) {
            return { kind: 'totp', challengeToken: response.challengeToken }
          }
          const account = await establishLegacySession(response, password)
          return { kind: 'done', legacyAccount: account }
        } finally {
          wipe(salt)
          wipe(authCredential)
        }
      }

      const bootstrap = await fetchLoginKdf(email, IDENTITY_KDF_PROFILE_ID)
      assertIdentityKdfProfile(bootstrap)
      if (!bootstrap.accountId) throw new Error('unsupported-kdf-profile')
      const accountSecret = decodeAccountSecret(encodedAccountSecret)
      const kdfSalt = decodeBase64Url(bootstrap.kdfSalt, 16)
      const identity = await deriveIdentityV2(
        password,
        accountSecret,
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
            accountSecret: new Uint8Array(accountSecret),
            bootstrap: { ...bootstrap, accountId: bootstrap.accountId },
          }
          return { kind: 'totp', challengeToken: response.challengeToken }
        }
        await unlockWithMasterKey(
          response,
          identity.masterKey,
          accountSecret,
          { ...bootstrap, accountId: bootstrap.accountId },
        )
        return { kind: 'done', legacyAccount: null }
      } finally {
        wipe(kdfSalt)
        wipe(accountSecret)
        wipe(identity.authCredential)
        wipe(identity.masterKey)
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
    }): Promise<{ legacyAccount: AccountResponse | null }> => {
      const response = await totpLogin({ challengeToken, code: code.trim() })
      if (!pendingV2.current) {
        const account = await establishLegacySession(response, password)
        return { legacyAccount: account }
      }

      const pending = pendingV2.current
      try {
        await unlockWithMasterKey(
          response,
          pending.masterKey,
          pending.accountSecret,
          pending.bootstrap,
        )
        return { legacyAccount: null }
      } finally {
        clearPendingV2()
      }
    },
  })

  return { start, submitTotp }
}
