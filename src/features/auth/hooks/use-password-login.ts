import { useCallback, useEffect, useRef, useState } from 'react'
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

const MANUAL_LOGIN_DEADLINE_MS = 5 * 60_000
interface PasswordCredentials { email: string; password: string }
interface PasswordStart extends PasswordCredentials {
  attempt: ReturnType<typeof beginManualUnlockAttempt>
  cleanup: Promise<void>
}

export function usePasswordLogin() {
  const pendingV2 = useRef<PendingV2Unlock | null>(null)
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAttempt = useRef<ReturnType<typeof beginManualUnlockAttempt> | null>(null)
  const [manualPending, setManualPending] = useState(false)

  const clearPendingV2 = useCallback(() => {
    if (pendingTimeout.current) clearTimeout(pendingTimeout.current)
    pendingTimeout.current = null
    if (!pendingV2.current) return
    wipe(pendingV2.current.masterKey)
    wipe(pendingV2.current.authCredential)
    pendingV2.current = null
  }, [])

  const finish = useCallback((attempt: ReturnType<typeof beginManualUnlockAttempt>) => {
    attempt.cancel()
    if (activeAttempt.current !== attempt) return
    activeAttempt.current = null
    clearPendingV2()
    setManualPending(false)
  }, [clearPendingV2])
  const cancel = useCallback(() => {
    if (activeAttempt.current) finish(activeAttempt.current)
  }, [finish])

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (state.isVaultLocked && state.cryptoSessionGeneration !== previous.cryptoSessionGeneration) cancel()
    })
    return () => { unsubscribe(); cancel() }
  }, [cancel])

  // The public mutation adapters acquire ownership synchronously on submission,
  // before TanStack schedules mutationFn or profile cleanup yields. TOTP keeps
  // this same owner between requests; an older completion cannot release it.
  const begin = (credentials: PasswordCredentials): PasswordStart => {
    cancel()
    const cleanup = clearClientSession()
    // An offline-paused mutation may await later; retain the original rejection
    // for it without producing an unhandled cleanup rejection in the meantime.
    void cleanup.catch(() => {})
    const guard = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
    const deadline = Date.now() + MANUAL_LOGIN_DEADLINE_MS
    const attempt = {
      ...guard,
      isCurrent: () => guard.isCurrent() && Date.now() < deadline,
      assertCurrent: () => {
        if (!guard.isCurrent() || Date.now() >= deadline) {
          finish(attempt)
          throw new Error('Unlock attempt cancelled')
        }
      },
    }
    activeAttempt.current = attempt
    pendingTimeout.current = setTimeout(() => finish(attempt), MANUAL_LOGIN_DEADLINE_MS)
    setManualPending(true)
    return { ...credentials, attempt, cleanup }
  }

  const start = useMutation({
    mutationFn: async ({ email, password, attempt, cleanup }: PasswordStart): Promise<LoginStartResult> => {
      let kdfSalt: Uint8Array | undefined
      let identity: Awaited<ReturnType<typeof deriveIdentityV1>> | undefined
      try {
        await cleanup
        attempt.assertCurrent()
        const bootstrap = await fetchLoginKdf(email, IDENTITY_KDF_PROFILE_ID)
        attempt.assertCurrent()
        assertIdentityKdfProfile(bootstrap)
        kdfSalt = decodeBase64Url(bootstrap.kdfSalt, 16)
        identity = await deriveIdentityV1(password, bootstrap.accountId, kdfSalt)
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
          return { kind: 'totp', challengeToken: response.challengeToken }
        }
        await unlockWithMasterKey(response, identity.masterKey, identity.authCredential, attempt, bootstrap)
        return { kind: 'done' }
      } finally {
        if (kdfSalt) wipe(kdfSalt)
        if (identity) { wipe(identity.authCredential); wipe(identity.masterKey) }
        if (pendingV2.current?.attempt !== attempt) finish(attempt)
      }
    },
  })

  const submitTotp = useMutation({
    mutationFn: async ({ challengeToken, code }: { challengeToken: string; code: string }): Promise<void> => {
      const pending = pendingV2.current
      if (!pending || pending.challengeToken !== challengeToken) throw new Error('Missing pending login state')
      pending.attempt.assertCurrent()
      const response = await totpLogin({ challengeToken, code: code.trim() })
      if (pending !== pendingV2.current) throw new Error('Expired pending login state')
      pending.attempt.assertCurrent()
      try {
        await unlockWithMasterKey(response, pending.masterKey, pending.authCredential, pending.attempt, pending.bootstrap)
      } finally { finish(pending.attempt) }
    },
  })

  return {
    start: {
      ...start,
      mutate: (input: PasswordCredentials, options?: Parameters<typeof start.mutate>[1]) => start.mutate(begin(input), options),
      mutateAsync: (input: PasswordCredentials, options?: Parameters<typeof start.mutateAsync>[1]) => start.mutateAsync(begin(input), options),
    },
    submitTotp, cancel, isPending: manualPending,
  }
}
