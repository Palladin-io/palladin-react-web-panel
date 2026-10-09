import { useEffect, useRef } from 'react'
import { beginManualUnlockAttempt } from '../session/manual-unlock-attempt'
import type { AuthResponse } from '../../../shared/api/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deriveKey,
  RECOVERY_KEY_SALT_BYTES,
} from '../../../shared/crypto/argon2'
import {
  deriveIdentityV1,
  generateIdentityAccountId,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_KDF_SALT_BYTES,
} from '../../../shared/crypto/identity-kdf'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import {
  encryptWithKey,
  generateKeyPair,
  randomBytes,
  wipe,
} from '../../../shared/crypto/sodium'
import { ACCOUNT_QUERY_KEY } from '../../../shared/api/account-api'
import i18n from '../../../shared/lib/i18n'
import { joinMnemonic } from '../../../shared/lib/mnemonic'
import { register, revokeUninstalledLoginSession } from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'

export interface RegisterInput {
  email: string
  masterPassword: string
  recoveryMnemonic: string[]
}

/**
 * Registration crypto pipeline. Identity v1 runs Argon2id once over the exact
 * password bytes and domain-separates MK from AuthCredential with HKDF.
 * The keypair's private key is wrapped twice (under MK and under the recovery
 * key) exactly like onboarding, then everything non-secret is POSTed to
 * `register`. All secret buffers are zeroed in `finally`; the only survivors are
 * the base64 ciphertexts on the wire and the in-memory copies handed to the
 * auth store so the user lands unlocked.
 */
export function useRegister() {
  const queryClient = useQueryClient()
  const activeAttempt = useRef<ReturnType<typeof beginManualUnlockAttempt> | null>(null)
  useEffect(() => () => { activeAttempt.current?.cancel() }, [])

  return useMutation({
    mutationFn: async ({
      email,
      masterPassword,
      recoveryMnemonic,
    }: RegisterInput) => {
      activeAttempt.current?.cancel()
      const attempt = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
      activeAttempt.current = attempt
      let issued: AuthResponse | null = null
      let installed = false
      const accountId = generateIdentityAccountId()
      let kdfSalt: Uint8Array | null = null
      let recoverySalt: Uint8Array | null = null
      let identity: Awaited<ReturnType<typeof deriveIdentityV1>> | null = null
      let keyPair: Awaited<ReturnType<typeof generateKeyPair>> | null = null
      let recoveryKey: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      let encryptedPrivateKeyByRecovery: Uint8Array | null = null
      try {
        kdfSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
        recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
        identity = await deriveIdentityV1(
          masterPassword,
          accountId,
          kdfSalt,
        )
        keyPair = await generateKeyPair()
        recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)
        encryptedPrivateKey = await encryptWithKey(
          keyPair.privateKey,
          identity.masterKey,
        )
        encryptedPrivateKeyByRecovery = await encryptWithKey(
          keyPair.privateKey,
          recoveryKey,
        )

        attempt.assertCurrent()
        const response = await register({
          accountId,
          email,
          // The register form collects only email + password; seed a sensible
          // display name from the local-part, editable later in settings.
          displayName: email.split('@')[0],
          preferredLanguage: i18n.language.startsWith('pl') ? 'pl' : 'en',
          securityVersion: IDENTITY_KDF_PROFILE.securityVersion,
          kdfProfileId: IDENTITY_KDF_PROFILE_ID,
          authCredential: encodeBase64Url(identity.authCredential),
          kdfSalt: encodeBase64Url(kdfSalt),
          recoverySalt: encodeBase64Url(recoverySalt),
          publicKey: encodeBase64Url(keyPair.publicKey),
          encryptedPrivateKey: encodeBase64Url(encryptedPrivateKey),
          encryptedPrivateKeyByRecovery: encodeBase64Url(encryptedPrivateKeyByRecovery),
        })

        issued = response
        attempt.assertCurrent()
        // Establish the session, then land the user already unlocked (we hold
        // MK + private key). Pass copies — the `finally` wipes the originals.
        useAuthStore.getState().setTokens(response)
        useAuthStore
          .getState()
          .unlockVault(identity.masterKey, keyPair.privateKey)
        installed = true
      } finally {
        if (identity) {
          wipe(identity.masterKey)
          wipe(identity.authCredential)
        }
        if (recoveryKey) wipe(recoveryKey)
        if (keyPair) wipe(keyPair.privateKey)
        if (kdfSalt) wipe(kdfSalt)
        if (recoverySalt) wipe(recoverySalt)
        if (encryptedPrivateKey) wipe(encryptedPrivateKey)
        if (encryptedPrivateKeyByRecovery) wipe(encryptedPrivateKeyByRecovery)
        attempt.cancel()
        if (issued && !installed) await revokeUninstalledLoginSession(issued.accessToken)
      }

      // No default vault here. CreateDefaultVault sits behind the email-verified
      // gate, so a fresh (still unverified) password account always gets a 403 —
      // and the client's 403 interceptor would fire a hard `window.location`
      // redirect to /verify-email in the middle of this mutation, stranding the
      // "Creating account" spinner. Registration now resolves cleanly and the
      // gate routes the user to /verify-email; the first vault is created later.
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}
