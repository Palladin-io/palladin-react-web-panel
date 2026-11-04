import { useEffect, useRef } from 'react'
import { beginManualUnlockAttempt } from '../session/manual-unlock-attempt'
import type { AuthResponse } from '../../../shared/api/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { generateIdentityAccountId } from '../../../shared/crypto/identity-kdf'
import {
  createAccountSecurityMaterial,
  generateMemberKeyPair,
  wipeAccountSecurityMaterial,
  type AccountSecurityMaterial,
} from '../../../shared/crypto/account-security'
import { emergencyKitMaterial, storeDeviceSecretKey, type EmergencyKitMaterial } from '../../../shared/crypto/secret-key'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { wipe } from '../../../shared/crypto/sodium'
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
 * Registration crypto pipeline (Identity v2). The Secret Key is generated here,
 * mixed into the KDF with the password and kept on this browser only through
 * the non-extractable device wrapper. The X-Wing Member private key is wrapped
 * under MK and the recovery key; only ciphertexts and public values leave the
 * device. The resolved kit values feed the mandatory Emergency Kit step.
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
    }: RegisterInput): Promise<EmergencyKitMaterial> => {
      activeAttempt.current?.cancel()
      const attempt = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
      activeAttempt.current = attempt
      let issued: AuthResponse | null = null
      let installed = false
      const accountId = generateIdentityAccountId()
      let memberKey: Awaited<ReturnType<typeof generateMemberKeyPair>> | null = null
      let material: AccountSecurityMaterial | null = null
      try {
        memberKey = await generateMemberKeyPair()
        material = await createAccountSecurityMaterial({
          accountId,
          password: masterPassword,
          recoveryPhrase: joinMnemonic(recoveryMnemonic),
          memberPrivateKey: memberKey.privateKey,
        })
        // Stored before the account exists so a closed tab never strands a registered account without its key.
        await storeDeviceSecretKey(accountId, material.secretKey)

        attempt.assertCurrent()
        const response = await register({
          accountId,
          email,
          // The register form collects only email + password; seed a sensible
          // display name from the local-part, editable later in settings.
          displayName: email.split('@')[0],
          preferredLanguage: i18n.language.startsWith('pl') ? 'pl' : 'en',
          securityVersion: material.securityVersion,
          kdfProfileId: material.kdfProfileId,
          authCredential: encodeBase64Url(material.authCredential),
          kdfSalt: material.kdfSalt,
          recoverySalt: material.recoverySalt,
          publicKeySuiteId: memberKey.keySuiteId,
          publicKey: encodeBase64Url(memberKey.publicKey),
          encryptedPrivateKey: material.encryptedPrivateKey,
          encryptedPrivateKeyByRecovery: material.encryptedPrivateKeyByRecovery,
        })

        issued = response
        attempt.assertCurrent()
        // Establish the session, then land the user already unlocked (we hold
        // MK + private key). Pass copies — the `finally` wipes the originals.
        useAuthStore.getState().setTokens(response)
        useAuthStore
          .getState()
          .unlockVault(material.masterKey, memberKey.privateKey, undefined, memberKey.keySuiteId)
        installed = true
        return emergencyKitMaterial(accountId, email, material.secretKey)
      } finally {
        wipeAccountSecurityMaterial(material)
        if (memberKey) wipe(memberKey.privateKey)
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
