import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../shared/api/account-api'
import { deriveCurrentAuthCredential, identityProfileVersion } from '../../../shared/crypto/identity-kdf'
import { loadDeviceSecretKey } from '../../../shared/crypto/secret-key'
import { wipe } from '../../../shared/crypto/sodium'
import { confirmTotp, disableTotp, enrollTotp } from '../api/auth-api'
import { IncorrectCurrentPasswordError } from './use-change-master-password'

export interface TotpCodeInput {
  code: string
  currentPassword: string
}

async function currentAuthCredential(currentPassword: string): Promise<string> {
  const account = await getAccount()
  if (!account.kdf) throw new Error('Account is missing versioned key material')
  const accountSecret = identityProfileVersion(account.kdf) === 2 ? await loadDeviceSecretKey(account.userId) : null
  try {
    return await deriveCurrentAuthCredential(currentPassword, account.userId, account.kdf, accountSecret)
  } finally {
    if (accountSecret) wipe(accountSecret)
  }
}

async function withPasswordStepUp<T>(
  currentPassword: string,
  request: (credential: string) => Promise<T>,
): Promise<T> {
  try {
    return await request(await currentAuthCredential(currentPassword))
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 403) {
      throw new IncorrectCurrentPasswordError()
    }
    throw error
  }
}

/**
 * TOTP enrollment mutations. Every step proves the current login password so
 * an access token alone cannot add or remove the second factor. `enroll`
 * fetches the pending secret + otpauth URI; `confirm` activates it and returns
 * the one-time recovery codes; `disable` turns it off with a code. Confirm and
 * disable invalidate the account query so `totpEnabled` stays current.
 */
export function useTotpEnrollment() {
  const queryClient = useQueryClient()

  const enroll = useMutation({
    mutationFn: (currentPassword: string) => withPasswordStepUp(currentPassword, enrollTotp),
  })

  const confirm = useMutation({
    mutationFn: ({ code, currentPassword }: TotpCodeInput) =>
      withPasswordStepUp(currentPassword, (credential) => confirmTotp(code.trim(), credential)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  })

  const disable = useMutation({
    mutationFn: ({ code, currentPassword }: TotpCodeInput) =>
      withPasswordStepUp(currentPassword, (credential) => disableTotp(code.trim(), credential)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  })

  return { enroll, confirm, disable }
}
