import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  CURRENT_IDENTITY_PROFILE,
  deriveAccountIdentity,
  identityProfileVersion,
  SecretKeyRequiredError,
  type IdentityKdfOutputs,
} from '../../../shared/crypto/identity-kdf'
import { loadDeviceSecretKey } from '../../../shared/crypto/secret-key'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, wipe } from '../../../shared/crypto/sodium'
import { getAccount, memberKeySuiteOf, type AccountResponse } from '../../../shared/api/account-api'
import {
  beginSecurityUpgrade,
  createSecurityUpgradeDraft,
  discardSecurityUpgradeDraft,
  needsSecurityUpgrade,
  resumeSecurityUpgradeIfNeeded,
  type SecurityUpgradeDraft,
} from '../../security-upgrade/prepare-security-upgrade'
import { cancelSecurityUpgrade } from '../../security-upgrade/security-upgrade-store'
import type { AuthResponse } from '../../../shared/api/types'
import {
  revokeUninstalledLoginSession,
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
import { duringManualLoginCleanup } from '../../../shared/lib/manual-login-cleanup'

interface PendingV2Unlock {
  masterKey: Uint8Array
  authCredential: Uint8Array
  challengeToken: string
  bootstrap: LoginKdfBootstrap
  draft: SecurityUpgradeDraft | null
  attempt: ReturnType<typeof beginManualUnlockAttempt>
}

/** The authenticated account must still be the exact profile the anonymous bootstrap ran. */
function assertAuthenticatedAccountProfile(
  account: AccountResponse,
  bootstrap: LoginKdfBootstrap,
): void {
  if (!account.kdf
    || account.userId !== bootstrap.accountId
    || account.kdf.securityVersion !== bootstrap.securityVersion
    || account.kdf.minimumSecurityVersion > CURRENT_IDENTITY_PROFILE.securityVersion
    || account.kdf.profileId !== bootstrap.profileId
    || account.kdf.kdfSalt !== bootstrap.kdfSalt) {
    throw new Error('security-version-downgrade')
  }
  identityProfileVersion(account.kdf)
}

/** Takes ownership of `draft`: it is either handed to the upgrade gate or wiped. */
async function unlockWithMasterKey(
  response: AuthResponse,
  masterKey: Uint8Array,
  authCredential: Uint8Array,
  attempt: ReturnType<typeof beginManualUnlockAttempt>,
  bootstrap: LoginKdfBootstrap,
  draft: SecurityUpgradeDraft | null,
): Promise<AccountResponse> {
  let owned = draft
  let installed = false
  try {
    attempt.assertCurrent()
  } catch (error) {
    discardSecurityUpgradeDraft(owned)
    throw error
  }
  useAuthStore.getState().setTokens(response)
  try {
    const account = await getAccount()
    attempt.assertCurrent()
    if (!account.encryptedPrivateKey) throw new Error('Account key material is missing')
    assertAuthenticatedAccountProfile(account, bootstrap)

    const encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
    let privateKey: Uint8Array | null = null
    try {
      privateKey = await decryptWithKey(encryptedPrivateKey, masterKey)
      attempt.assertCurrent()
      if (owned) {
        const handed = owned
        owned = null
        await beginSecurityUpgrade({ account, draft: handed, currentAuthCredential: authCredential, legacyPrivateKey: privateKey })
      } else {
        await resumeSecurityUpgradeIfNeeded(account, masterKey)
      }
      attempt.assertCurrent()
      useAuthStore.getState().unlockVault(masterKey, privateKey, undefined, memberKeySuiteOf(account))
      installed = true
      await prepareManualSharedUnlock(account, authCredential)
      return account
    } finally {
      wipe(encryptedPrivateKey)
      if (privateKey) wipe(privateKey)
    }
  } catch (error) {
    if (attempt.isCurrent()) await clearClientSession()
    throw error
  } finally {
    discardSecurityUpgradeDraft(owned)
    if (!installed) cancelSecurityUpgrade()
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
    discardSecurityUpgradeDraft(pendingV2.current.draft)
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
    const cleanup = duringManualLoginCleanup(clearClientSession)
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
      let issued: AuthResponse | undefined
      let installed = false
      let accountSecret: Uint8Array | null = null
      let identity: IdentityKdfOutputs | undefined
      let draft: SecurityUpgradeDraft | null = null
      try {
        await cleanup
        attempt.assertCurrent()
        const bootstrap = await fetchLoginKdf(email, CURRENT_IDENTITY_PROFILE.id)
        attempt.assertCurrent()
        const version = identityProfileVersion(bootstrap)
        if (version === 2) {
          accountSecret = await loadDeviceSecretKey(bootstrap.accountId)
          if (!accountSecret) throw new SecretKeyRequiredError(bootstrap.accountId)
        }
        identity = await deriveAccountIdentity({ password, accountId: bootstrap.accountId, kdf: bootstrap, accountSecret })
        attempt.assertCurrent()
        const response = await passwordLogin({
          email,
          securityVersion: bootstrap.securityVersion,
          kdfProfileId: bootstrap.profileId,
          authCredential: encodeBase64Url(identity.authCredential),
        })
        if (!isTotpRequired(response)) issued = response
        attempt.assertCurrent()
        // The password is gone after this request; derive the upgrade material now.
        if (needsSecurityUpgrade(version)) draft = await createSecurityUpgradeDraft(bootstrap.accountId, password)
        attempt.assertCurrent()
        if (isTotpRequired(response)) {
          pendingV2.current = {
            masterKey: new Uint8Array(identity.masterKey),
            authCredential: new Uint8Array(identity.authCredential),
            challengeToken: response.challengeToken,
            bootstrap,
            draft,
            attempt,
          }
          draft = null
          return { kind: 'totp', challengeToken: response.challengeToken }
        }
        const owned = draft
        draft = null
        await unlockWithMasterKey(response, identity.masterKey, identity.authCredential, attempt, bootstrap, owned)
        installed = true
        return { kind: 'done' }
      } finally {
        discardSecurityUpgradeDraft(draft)
        if (accountSecret) wipe(accountSecret)
        if (identity) { wipe(identity.authCredential); wipe(identity.masterKey) }
        if (pendingV2.current?.attempt !== attempt) finish(attempt)
        if (issued && !installed) await revokeUninstalledLoginSession(issued.accessToken)
      }
    },
  })

  const submitTotp = useMutation({
    mutationFn: async ({ challengeToken, code }: { challengeToken: string; code: string }): Promise<void> => {
      const pending = pendingV2.current
      if (!pending || pending.challengeToken !== challengeToken) throw new Error('Missing pending login state')
      pending.attempt.assertCurrent()
      const response = await totpLogin({ challengeToken, code: code.trim() })
      let installed = false
      try {
        if (pending !== pendingV2.current) throw new Error('Expired pending login state')
        pending.attempt.assertCurrent()
        const draft = pending.draft
        pending.draft = null
        await unlockWithMasterKey(response, pending.masterKey, pending.authCredential, pending.attempt, pending.bootstrap, draft)
        installed = true
      } finally {
        finish(pending.attempt)
        if (!installed) await revokeUninstalledLoginSession(response.accessToken)
      }
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
