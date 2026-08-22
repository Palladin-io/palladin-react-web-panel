import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { useUnlock } from './use-unlock'

const getAccount = vi.hoisted(() => vi.fn())
const setupAccount = vi.hoisted(() => vi.fn())
const deriveIdentityV1 = vi.hoisted(() => vi.fn())
const decryptWithKey = vi.hoisted(() => vi.fn())
const derivePublicKey = vi.hoisted(() => vi.fn())
const unlockVault = vi.hoisted(() => vi.fn())

vi.mock('../../shared/api/account-api', () => ({
  getAccountForSession: getAccount,
  setupAccount,
}))
vi.mock('../../shared/crypto/identity-kdf', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/identity-kdf')>(),
  deriveIdentityV1,
}))
vi.mock('../../shared/crypto/sodium', () => ({
  decryptWithKey,
  derivePublicKey,
  wipe: vi.fn(),
}))
vi.mock('../auth/session/session-boundary', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/session/session-boundary')>(),
  unlockVaultForSession: (
    _session: unknown,
    masterKey: Uint8Array,
    privateKey: Uint8Array,
  ) => {
    unlockVault(masterKey, privateKey)
    return true
  },
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
    deriveIdentityV1.mockResolvedValue({
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

  it('enables password login after an OAuth-only account proves its master password', async () => {
    const { result } = renderHook(() => useUnlock(), { wrapper })

    await result.current.mutateAsync({ password: 'master-password' })

    expect(setupAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        kdfSalt,
        encryptedPrivateKey,
        encryptedPrivateKeyByRecovery,
        newAuthCredential: encodeBase64Url(new Uint8Array(32).fill(5)),
      }),
      expect.objectContaining({ sessionGeneration: expect.any(Number) }),
    )
    expect(unlockVault).toHaveBeenCalledOnce()
  })

  it('does not rewrite an existing password login method', async () => {
    getAccount.mockResolvedValueOnce({
      ...await getAccount(),
      kdf: { ...(await getAccount()).kdf, credentialRevision: 1 },
    })
    const { result } = renderHook(() => useUnlock(), { wrapper })

    await result.current.mutateAsync({ password: 'master-password' })

    expect(setupAccount).not.toHaveBeenCalled()
    expect(unlockVault).toHaveBeenCalledOnce()
  })
})
