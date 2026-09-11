import { useCallback, useEffect, useRef } from 'react'
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
import { prepareManualSharedUnlock } from '../shared-unlock/manual-source'
import { beginManualUnlockAttempt } from '../session/manual-unlock-attempt'

interface PendingV2Unlock {
  masterKey: Uint8Array
  authCredential: Uint8Array
  challengeToken: string
  bootstrap: LoginKdfBootstrap
  attempt: ReturnType<typeof beginManualUnlockAttempt>
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
  authCredential: Uint8Array,
  attempt: ReturnType<typeof beginManualUnlockAttempt>,
  bootstrap?: LoginKdfBootstrap,
): Promise<AccountResponse> {
  attempt.assertCurrent()
  useAuthStore.getState().setTokens(response)
  try {
    const account = await getAccount()
    attempt.assertCurrent()
    if (!account.encryptedPrivateKey) throw new Error('Account key material is missing')
    if (bootstrap) assertAuthenticatedV2Account(account, bootstrap)

    const encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
    let privateKey: Uint8Array | null = null
    try {
      privateKey = await decryptWithKey(encryptedPrivateKey, masterKey)
      attempt.assertCurrent()
      useAuthStore.getState().unlockVault(masterKey, privateKey)
      await prepareManualSharedUnlock(account, authCredential)
      return account
    } finally {
      wipe(encryptedPrivateKey)
      if (privateKey) wipe(privateKey)
    }
  } catch (error) {
    if (attempt.isCurrent()) await clearClientSession()
    throw error
  }
}

export type LoginStartResult =
  | { kind: 'done' }
  | { kind: 'totp'; challengeToken: string }

export function usePasswordLogin() {
  const pendingV2 = useRef<PendingV2Unlock | null>(null)
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAttempt = useRef<ReturnType<typeof beginManualUnlockAttempt> | null>(null)

  const clearPendingV2 = useCallback(() => {
    if (pendingTimeout.current) clearTimeout(pendingTimeout.current)
    pendingTimeout.current = null
    if (!pendingV2.current) return
    wipe(pendingV2.current.masterKey)
    wipe(pendingV2.current.authCredential)
    pendingV2.current = null
  }, [])

  const cancel = useCallback(() => { activeAttempt.current?.cancel(); clearPendingV2() }, [clearPendingV2])

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (state.isVaultLocked && state.cryptoSessionGeneration !== previous.cryptoSessionGeneration) cancel()
    })
    return () => { unsubscribe(); cancel() }
  }, [cancel])

  const start = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }): Promise<LoginStartResult> => {
      clearPendingV2()
      const attempt = beginManualUnlockAttempt()
      activeAttempt.current = attempt
      const bootstrap = await fetchLoginKdf(email, IDENTITY_KDF_PROFILE_ID)
      attempt.assertCurrent()
      assertIdentityKdfProfile(bootstrap)
      const kdfSalt = decodeBase64Url(bootstrap.kdfSalt, 16)
      const identity = await deriveIdentityV1(
        password,
        bootstrap.accountId,
        kdfSalt,
      )
      try {
        attempt.assertCurrent()
        const response = await passwordLogin({
          email,
          securityVersion: IDENTITY_SECURITY_VERSION,
          kdfProfileId: IDENTITY_KDF_PROFILE_ID,
          authCredential: encodeBase64Url(identity.authCredential),
        })
        attempt.assertCurrent()
        if (isTotpRequired(response)) {
          pendingV2.current = {
            masterKey: new Uint8Array(identity.masterKey),
            authCredential: new Uint8Array(identity.authCredential),
            challengeToken: response.challengeToken,
            bootstrap,
            attempt,
          }
          pendingTimeout.current = setTimeout(cancel, 5 * 60_000)
          return { kind: 'totp', challengeToken: response.challengeToken }
        }
        await unlockWithMasterKey(
          response,
          identity.masterKey,
          identity.authCredential,
          attempt,
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
      const pending = pendingV2.current
      if (!pending || pending.challengeToken !== challengeToken) throw new Error('Missing pending login state')
      pending.attempt.assertCurrent()
      const response = await totpLogin({ challengeToken, code: code.trim() })
      if (pending !== pendingV2.current) throw new Error('Expired pending login state')
      pending.attempt.assertCurrent()
      try {
        await unlockWithMasterKey(
          response,
          pending.masterKey,
          pending.authCredential,
          pending.attempt,
          pending.bootstrap,
        )
      } finally {
        if (pending === pendingV2.current) clearPendingV2()
      }
    },
  })

  return { start, submitTotp, cancel }
}
