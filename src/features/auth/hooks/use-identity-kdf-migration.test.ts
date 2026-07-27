import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { useIdentityKdfMigration } from './use-identity-kdf-migration'

const getAccountMock = vi.hoisted(() => vi.fn())
const migrateIdentityKdfMock = vi.hoisted(() => vi.fn())
const fetchLoginKdfMock = vi.hoisted(() => vi.fn())
const deriveKeyMock = vi.hoisted(() => vi.fn())
const deriveIdentityV2Mock = vi.hoisted(() => vi.fn())
const randomBytesMock = vi.hoisted(() => vi.fn())
const encryptWithKeyMock = vi.hoisted(() => vi.fn())
const unlockVaultMock = vi.hoisted(() => vi.fn())
const wipeMock = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/api/account-api', () => ({
  ACCOUNT_QUERY_KEY: ['account'],
  getAccount: getAccountMock,
  migrateIdentityKdf: migrateIdentityKdfMock,
}))
vi.mock('../api/auth-api', () => ({ fetchLoginKdf: fetchLoginKdfMock }))
vi.mock('../../../shared/crypto/argon2', () => ({ deriveKey: deriveKeyMock }))
vi.mock('../../../shared/crypto/identity-kdf', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/identity-kdf')>(),
  deriveIdentityV2: deriveIdentityV2Mock,
  generateIdentityAccountId: () => '11111111-1111-4111-8111-111111111111',
}))
vi.mock('../../../shared/crypto/sodium', () => ({
  randomBytes: randomBytesMock,
  encryptWithKey: encryptWithKeyMock,
  wipe: wipeMock,
}))
vi.mock('../stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      privateKey: new Uint8Array(32).fill(7),
      unlockVault: unlockVaultMock,
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useIdentityKdfMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccountMock.mockResolvedValue({
      userId: '00112233-4455-4677-8899-aabbccddeeff',
      email: 'user@example.com',
      kdf: {
        securityVersion: 1,
        minimumSecurityVersion: 1,
        profileId: 'identity-argon2id-legacy-v1',
        kdfSalt: encodeBase64Url(new Uint8Array(16).fill(1)),
        credentialRevision: 3,
        privateKeyWrapRevision: 5,
      },
    })
    fetchLoginKdfMock.mockResolvedValue({
      kdfSalt: encodeBase64Url(new Uint8Array(16).fill(2)),
    })
    deriveKeyMock.mockResolvedValue(new Uint8Array(32).fill(3))
    randomBytesMock.mockResolvedValue(new Uint8Array(16).fill(4))
    deriveIdentityV2Mock.mockResolvedValue({
      authCredential: new Uint8Array(32).fill(5),
      masterKey: new Uint8Array(32).fill(6),
    })
    encryptWithKeyMock.mockResolvedValue(new Uint8Array(72).fill(8))
    unlockVaultMock.mockReset()
  })

  it('retries an interrupted upgrade with the exact same idempotent payload', async () => {
    migrateIdentityKdfMock
      .mockRejectedValueOnce(new Error('network interrupted'))
      .mockResolvedValueOnce(undefined)
    const accountSecret = new Uint8Array(32).fill(9)
    const { result } = renderHook(() => useIdentityKdfMigration(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({
        password: 'correct horse battery staple',
        accountSecret,
      })).rejects.toThrow('network interrupted')
    })
    await act(async () => {
      await result.current.mutateAsync({
        password: 'correct horse battery staple',
        accountSecret,
      })
    })

    expect(getAccountMock).toHaveBeenCalledOnce()
    expect(fetchLoginKdfMock).toHaveBeenCalledOnce()
    expect(deriveKeyMock).toHaveBeenCalledOnce()
    expect(deriveIdentityV2Mock).toHaveBeenCalledOnce()
    expect(migrateIdentityKdfMock).toHaveBeenCalledTimes(2)
    expect(migrateIdentityKdfMock.mock.calls[1][0]).toEqual(
      migrateIdentityKdfMock.mock.calls[0][0],
    )
    expect(migrateIdentityKdfMock.mock.calls[0][0]).toMatchObject({
      migrationId: '11111111-1111-4111-8111-111111111111',
      sourceSecurityVersion: 1,
      baseCredentialRevision: 3,
      basePrivateKeyWrapRevision: 5,
      targetProfileId: 'identity-argon2id-account-secret-v2',
    })
    expect(unlockVaultMock).toHaveBeenCalledOnce()
  })
})
