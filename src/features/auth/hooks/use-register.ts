import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AUTH_SALT_BYTES,
  deriveKey,
  MASTER_KEY_SALT_BYTES,
  RECOVERY_KEY_SALT_BYTES,
} from '../../../shared/crypto/argon2'
import { toBase64 } from '../../../shared/crypto/encoding'
import {
  encryptWithKey,
  generateKeyPair,
  randomBytes,
  wipe,
} from '../../../shared/crypto/sodium'
import { ACCOUNT_QUERY_KEY } from '../../../shared/api/account-api'
import i18n from '../../../shared/lib/i18n'
import { joinMnemonic } from '../../../shared/lib/mnemonic'
import { register } from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'

export interface RegisterInput {
  email: string
  masterPassword: string
  recoveryMnemonic: string[]
}

/**
 * Registration crypto pipeline (Variant A). From the single password we run
 * two independent Argon2id derivations:
 *   • MK       = deriveKey(password, salt)      — wraps the private key, never sent
 *   • authHash = deriveKey(password, authSalt)  — the only password-derived value
 *     that leaves the browser; the server re-hashes it at rest
 * The keypair's private key is wrapped twice (under MK and under the recovery
 * key) exactly like onboarding, then everything non-secret is POSTed to
 * `register`. All secret buffers are zeroed in `finally`; the only survivors are
 * the base64 ciphertexts on the wire and the in-memory copies handed to the
 * auth store so the user lands unlocked.
 */
export function useRegister() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, masterPassword, recoveryMnemonic }: RegisterInput) => {
      const salt = await randomBytes(MASTER_KEY_SALT_BYTES)
      const authSalt = await randomBytes(AUTH_SALT_BYTES)
      const recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)

      const masterKey = await deriveKey(masterPassword, salt)
      const authHash = await deriveKey(masterPassword, authSalt)
      const keyPair = await generateKeyPair()
      const recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)

      try {
        const encryptedPrivateKey = await encryptWithKey(keyPair.privateKey, masterKey)
        const encryptedPrivateKeyByRecovery = await encryptWithKey(
          keyPair.privateKey,
          recoveryKey,
        )

        const response = await register({
          email,
          // The register form collects only email + password; seed a sensible
          // display name from the local-part, editable later in settings.
          displayName: email.split('@')[0],
          preferredLanguage: i18n.language.startsWith('pl') ? 'pl' : 'en',
          authHash: toBase64(authHash),
          authSalt: toBase64(authSalt),
          salt: toBase64(salt),
          recoverySalt: toBase64(recoverySalt),
          publicKey: toBase64(keyPair.publicKey),
          encryptedPrivateKey: toBase64(encryptedPrivateKey),
          encryptedPrivateKeyByRecovery: toBase64(encryptedPrivateKeyByRecovery),
        })

        // Establish the session, then land the user already unlocked (we hold
        // MK + private key). Pass copies — the `finally` wipes the originals.
        useAuthStore.getState().setTokens(response)
        useAuthStore
          .getState()
          .unlockVault(new Uint8Array(masterKey), new Uint8Array(keyPair.privateKey))
      } finally {
        wipe(masterKey)
        wipe(authHash)
        wipe(recoveryKey)
        wipe(keyPair.privateKey)
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
