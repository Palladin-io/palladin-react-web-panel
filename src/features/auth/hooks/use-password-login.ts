import { useEffect, useRef } from 'react'
import { useAuthenticatedMutation as useMutation } from '../session/use-authenticated-mutation'
import {
  assertIdentityKdfProfile,
  deriveIdentityV1,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_SECURITY_VERSION,
} from '../../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, wipe } from '../../../shared/crypto/sodium'
import {
  getAccountForSession,
  type AccountResponse,
} from '../../../shared/api/account-api'
import type { AuthResponse } from '../../../shared/api/types'
import {
  fetchLoginKdf,
  isTotpRequired,
  passwordLogin,
  totpLogin,
  type LoginKdfBootstrap,
} from '../api/auth-api'
import {
  captureAuthenticatedSession,
  replaceAuthenticatedSession,
  StaleAuthenticatedSessionError,
  terminateAuthenticatedSession,
  unlockVaultForSession,
} from '../session/session-boundary'
import type { AuthenticatedMutationContext } from '../session/use-authenticated-mutation'

interface PendingV2Unlock {
  masterKey: Uint8Array
  bootstrap: LoginKdfBootstrap & { accountId: string }
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
  })
}

async function unlockWithMasterKey(
  response: AuthResponse,
  masterKey: Uint8Array,
  context: AuthenticatedMutationContext,
  bootstrap?: LoginKdfBootstrap & { accountId: string },
): Promise<AccountResponse> {
  const session = await replaceAuthenticatedSession(response, {
    expectedSession: context.sessionSnapshot,
  })
  if (!session) throw new StaleAuthenticatedSessionError()
  context.adoptSession(session)
  try {
    const account = await getAccountForSession(session)
    if (!account.encryptedPrivateKey) throw new Error('Account key material is missing')
    if (bootstrap) assertAuthenticatedV2Account(account, bootstrap)

    const encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
    let privateKey: Uint8Array | null = null
    try {
      privateKey = await decryptWithKey(encryptedPrivateKey, masterKey)
      if (!unlockVaultForSession(session, masterKey, privateKey)) {
        throw new StaleAuthenticatedSessionError()
      }
      return account
    } finally {
      wipe(encryptedPrivateKey)
      if (privateKey) wipe(privateKey)
    }
  } catch (error) {
    if (await terminateAuthenticatedSession(session)) {
      context.adoptSession(captureAuthenticatedSession())
    }
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
    }, context): Promise<LoginStartResult> => {
      clearPendingV2()
      const bootstrap = await fetchLoginKdf(email, IDENTITY_KDF_PROFILE_ID)
      assertIdentityKdfProfile(bootstrap)
      if (!bootstrap.accountId) throw new Error('unsupported-kdf-profile')
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
          context.assertSessionCurrent()
          pendingV2.current = {
            masterKey: new Uint8Array(identity.masterKey),
            bootstrap: { ...bootstrap, accountId: bootstrap.accountId },
          }
          return { kind: 'totp', challengeToken: response.challengeToken }
        }
        await unlockWithMasterKey(
          response,
          identity.masterKey,
          context,
          { ...bootstrap, accountId: bootstrap.accountId },
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
    }, context): Promise<void> => {
      const response = await totpLogin({ challengeToken, code: code.trim() })
      if (!pendingV2.current) throw new Error('Missing pending login state')

      const pending = pendingV2.current
      try {
        await unlockWithMasterKey(
          response,
          pending.masterKey,
          context,
          pending.bootstrap,
        )
      } finally {
        clearPendingV2()
      }
    },
  })

  return { start, submitTotp }
}
