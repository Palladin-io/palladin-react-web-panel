import { deriveIdentityV2, generateRecipientKeyPair, parseSecretKey } from '@palladin/crypto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth/stores/auth-store'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../shared/crypto/argon2'
import { decryptWithKey, encryptWithKey, randomBytes } from '../../shared/crypto/sodium'
import { decodeBase64Url, encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { joinMnemonic } from '../../shared/lib/mnemonic'
import { RecoveryProofInvalidError, useRecover } from './use-recover'

const mocks = vi.hoisted(() => ({ account: vi.fn(), recover: vi.fn(), challenge: vi.fn(), proof: vi.fn(), store: vi.fn() }))
vi.mock('../../shared/api/account-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/api/account-api')>(),
  getAccount: mocks.account, recoverAccount: mocks.recover, issueRecoveryChallenge: mocks.challenge,
}))
vi.mock('../../shared/crypto/account-recovery-proof', () => ({ createAccountRecoveryProof: mocks.proof }))
vi.mock('../../shared/crypto/secret-key', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/secret-key')>(), storeDeviceSecretKey: mocks.store,
}))

const userId = '00112233-4455-4677-8899-aabbccddeeff'
const phrase = Array.from({ length: 24 }, (_, index) => `word${index}`)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }, children)
}

beforeEach(async () => {
  vi.clearAllMocks()
  useAuthStore.setState({ userId })
  const member = await generateRecipientKeyPair()
  const recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
  const recoveryKey = await deriveKey(joinMnemonic(phrase), recoverySalt)
  mocks.account.mockResolvedValue({
    userId, email: 'user@example.com', memberPublicKeySuiteId: member.keySuiteId,
    recoverySalt: encodeBase64Url(recoverySalt),
    encryptedPrivateKeyByRecovery: encodeBase64Url(await encryptWithKey(member.privateKey, recoveryKey)),
    kdf: { securityVersion: 2, profileId: 'identity-argon2id-account-secret-v2', credentialRevision: 3, privateKeyWrapRevision: 4 },
  })
  mocks.challenge.mockResolvedValue({ version: 2, sealedChallenge: 'challenge', expiresAt: '' })
  mocks.proof.mockResolvedValue('proof')
  mocks.recover.mockResolvedValue(undefined)
  mocks.store.mockResolvedValue(undefined)
})

it('issues a new Secret Key and kit, keeps the Member key and stores the key only after Identity accepted it', async () => {
  const { result } = renderHook(() => useRecover(), { wrapper })
  const recovered = await result.current.mutateAsync({ recoveryMnemonic: phrase, newPassword: 'new password 1' })

  const payload = mocks.recover.mock.calls[0][0]
  expect(payload).toMatchObject({
    securityVersion: 2, kdfProfileId: 'identity-argon2id-account-secret-v2',
    baseCredentialRevision: 3, basePrivateKeyWrapRevision: 4, recoveryProof: 'proof',
  })
  expect(mocks.proof).toHaveBeenCalledWith('challenge', userId, expect.objectContaining({ keySuiteId: 'palladin-xwing-v1' }))
  expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(mocks.store.mock.invocationCallOrder[0])

  const secret = parseSecretKey(userId, recovered.kit!.secretKey)
  const identity = await deriveIdentityV2('new password 1', secret, userId, decodeBase64Url(payload.newKdfSalt, 16))
  expect(encodeBase64Url(identity.authCredential)).toBe(payload.newAuthCredential)
  const account = await mocks.account()
  const rk = await deriveKey(joinMnemonic(phrase), decodeBase64Url(account.recoverySalt))
  const original = await decryptWithKey(decodeBase64Url(account.encryptedPrivateKeyByRecovery), rk)
  expect(Array.from(await decryptWithKey(decodeBase64Url(payload.newEncryptedPrivateKey), identity.masterKey)))
    .toEqual(Array.from(original))
  expect(recovered.recoveryMnemonic).toHaveLength(24)
})

it('refuses a legacy challenge for an X-Wing account and keeps the old Secret Key', async () => {
  mocks.challenge.mockResolvedValueOnce({ version: 1, sealedChallenge: 'challenge', expiresAt: '' })
  const { result } = renderHook(() => useRecover(), { wrapper })
  await expect(result.current.mutateAsync({ recoveryMnemonic: phrase, newPassword: 'new password 1' }))
    .rejects.toBeInstanceOf(RecoveryProofInvalidError)
  expect(mocks.recover).not.toHaveBeenCalled()
  expect(mocks.store).not.toHaveBeenCalled()
})
