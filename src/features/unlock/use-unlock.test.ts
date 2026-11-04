import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { useUnlock } from './use-unlock'
import { useAuthStore } from '../auth/stores/auth-store'

const getAccount = vi.hoisted(() => vi.fn())
const setupAccount = vi.hoisted(() => vi.fn())
const deriveAccountIdentity = vi.hoisted(() => vi.fn())
const decryptWithKey = vi.hoisted(() => vi.fn())
const derivePublicKey = vi.hoisted(() => vi.fn())
const unlockVault = vi.hoisted(() => vi.fn())
const prepareManualSharedUnlock = vi.hoisted(() => vi.fn())
const upgrade = vi.hoisted(() => ({
  createDraft: vi.fn(),
  begin: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
}))
const loadDeviceSecretKey = vi.hoisted(() => vi.fn())

vi.mock('../../shared/api/account-api', () => ({
  memberKeySuiteOf: (account: { memberKeySuiteId?: string | null }) => account.memberKeySuiteId ?? 'palladin-x25519-sealed-box-v1', getAccount, setupAccount }))
vi.mock('../../shared/crypto/identity-kdf', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/identity-kdf')>(),
  deriveAccountIdentity,
}))
vi.mock('../../shared/crypto/secret-key', () => ({ loadDeviceSecretKey }))
vi.mock('../security-upgrade', () => ({
  createSecurityUpgradeDraft: upgrade.createDraft,
  beginSecurityUpgrade: upgrade.begin,
  resumeSecurityUpgradeIfNeeded: upgrade.resume,
  cancelSecurityUpgrade: upgrade.cancel,
  discardSecurityUpgradeDraft: vi.fn(),
  needsSecurityUpgrade: (version: number) => version < 2,
}))
vi.mock('../../shared/crypto/sodium', () => ({
  decryptWithKey,
  derivePublicKey,
  wipe: vi.fn(),
}))
vi.mock('../auth', async () => ({
  beginManualUnlockAttempt: (await import('../auth/session/manual-unlock-attempt')).beginManualUnlockAttempt,
  useAuthStore: { getState: () => ({ unlockVault }) },
  prepareManualSharedUnlock,
}))

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children)
}

const accountId = '00112233-4455-4677-8899-aabbccddeeff'
const kdfSalt = encodeBase64Url(new Uint8Array(16).fill(1))
const encryptedPrivateKey = encodeBase64Url(new Uint8Array(72).fill(2))
const encryptedPrivateKeyByRecovery = encodeBase64Url(new Uint8Array(72).fill(3))
const recoverySalt = encodeBase64Url(new Uint8Array(16).fill(4))

describe('useUnlock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deriveAccountIdentity.mockResolvedValue({
      authCredential: new Uint8Array(32).fill(5),
      masterKey: new Uint8Array(32).fill(6),
    })
    decryptWithKey.mockResolvedValue(new Uint8Array(32).fill(7))
    derivePublicKey.mockResolvedValue(new Uint8Array(32).fill(8))
    setupAccount.mockResolvedValue(undefined)
    getAccount.mockResolvedValue({
      userId: accountId,
      encryptedPrivateKey,
      recoverySalt,
      encryptedPrivateKeyByRecovery,
      kdf: {
        securityVersion: 1,
        minimumSecurityVersion: 1,
        profileId: 'identity-argon2id-password-v1',
        kdfSalt,
        credentialRevision: 0,
        privateKeyWrapRevision: 1,
        deviceWrapperMetadata: null,
      },
    })
  })

  it('prepares the in-place security upgrade for a v1 account before publishing the legacy keys', async () => {
    const draft = { recoveryMnemonic: [], material: {} }
    upgrade.createDraft.mockResolvedValue(draft)
    const { result } = renderHook(() => useUnlock(), { wrapper })

    await result.current.mutateAsync({ password: 'master-password' })

    expect(upgrade.createDraft).toHaveBeenCalledWith(accountId, 'master-password')
    expect(upgrade.begin).toHaveBeenCalledWith(expect.objectContaining({
      draft, currentAuthCredential: new Uint8Array(32).fill(5), legacyPrivateKey: new Uint8Array(32).fill(7),
    }))
    expect(upgrade.begin.mock.invocationCallOrder[0]).toBeLessThan(unlockVault.mock.invocationCallOrder[0])
    expect(unlockVault).toHaveBeenCalledWith(expect.any(Uint8Array), expect.any(Uint8Array), undefined,
      'palladin-x25519-sealed-box-v1')
    expect(setupAccount).not.toHaveBeenCalled()
  })

  it('derives v2 with this browser\'s Secret Key and resumes a committed upgrade', async () => {
    const v2 = {
      ...await getAccount(),
      memberKeySuiteId: 'palladin-xwing-v1',
      kdf: { ...(await getAccount()).kdf, securityVersion: 2, minimumSecurityVersion: 2,
        profileId: 'identity-argon2id-account-secret-v2', credentialRevision: 2 },
    }
    getAccount.mockResolvedValueOnce(v2)
    loadDeviceSecretKey.mockResolvedValueOnce(new Uint8Array(32).fill(9))
    const { result } = renderHook(() => useUnlock(), { wrapper })

    await result.current.mutateAsync({ password: 'master-password' })

    expect(deriveAccountIdentity).toHaveBeenCalledWith({
      password: 'master-password', accountId, kdf: v2.kdf, accountSecret: new Uint8Array(32).fill(9),
    })
    expect(upgrade.createDraft).not.toHaveBeenCalled()
    expect(upgrade.resume).toHaveBeenCalledWith(v2, expect.any(Uint8Array))
    expect(unlockVault).toHaveBeenCalledWith(expect.any(Uint8Array), expect.any(Uint8Array), undefined, 'palladin-xwing-v1')
  })

  it('asks for the Secret Key instead of deriving when this browser holds none', async () => {
    getAccount.mockResolvedValueOnce({
      ...await getAccount(),
      kdf: { ...(await getAccount()).kdf, securityVersion: 2, minimumSecurityVersion: 2,
        profileId: 'identity-argon2id-account-secret-v2' },
    })
    loadDeviceSecretKey.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useUnlock(), { wrapper })

    await expect(result.current.mutateAsync({ password: 'pw' })).rejects.toMatchObject({
      name: 'SecretKeyRequiredError', accountId,
    })
    expect(deriveAccountIdentity).not.toHaveBeenCalled()
    expect(unlockVault).not.toHaveBeenCalled()
  })

  for (const action of ['lockVault', 'logout', 'expireSession'] as const) {
    it(`cannot publish keys after ${action} while derivation is pending`, async () => {
      let resolve!: (value: { authCredential: Uint8Array; masterKey: Uint8Array }) => void
      deriveAccountIdentity.mockReturnValueOnce(new Promise(r => { resolve = r }))
      const { result } = renderHook(() => useUnlock(), { wrapper })
      const unlocking = result.current.mutateAsync({ password: 'pw' })
      const rejected = expect(unlocking).rejects.toThrow('Unlock attempt cancelled')
      await vi.waitFor(() => expect(deriveAccountIdentity).toHaveBeenCalledOnce())
      useAuthStore.getState()[action]()
      resolve({ authCredential: new Uint8Array(32).fill(5), masterKey: new Uint8Array(32).fill(6) })
      await rejected
      expect(unlockVault).not.toHaveBeenCalled()
      expect(prepareManualSharedUnlock).not.toHaveBeenCalled()
      expect(upgrade.begin).not.toHaveBeenCalled()
    })
  }
})
