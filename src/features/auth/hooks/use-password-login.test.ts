import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { usePasswordLogin } from './use-password-login'

const fetchLoginKdfMock = vi.hoisted(() => vi.fn())
const passwordLoginMock = vi.hoisted(() => vi.fn())
const totpLoginMock = vi.hoisted(() => vi.fn())
const deriveIdentityV2Mock = vi.hoisted(() => vi.fn())
const decryptWithKeyMock = vi.hoisted(() => vi.fn())
const getAccountMock = vi.hoisted(() => vi.fn())
const setTokensMock = vi.hoisted(() => vi.fn())
const unlockVaultMock = vi.hoisted(() => vi.fn())
const logoutMock = vi.hoisted(() => vi.fn())

vi.mock('../api/auth-api', () => ({
  fetchLoginKdf: fetchLoginKdfMock,
  passwordLogin: passwordLoginMock,
  totpLogin: totpLoginMock,
  isTotpRequired: (response: { totpRequired?: boolean }) => response.totpRequired === true,
}))
vi.mock('../../../shared/api/account-api', () => ({ getAccount: getAccountMock }))
vi.mock('../../../shared/crypto/argon2', () => ({ deriveKey: vi.fn() }))
vi.mock('../../../shared/crypto/identity-kdf', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/identity-kdf')>(),
  deriveIdentityV2: deriveIdentityV2Mock,
}))
vi.mock('../../../shared/crypto/sodium', () => ({
  decryptWithKey: decryptWithKeyMock,
  wipe: vi.fn(),
}))
vi.mock('../stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      setTokens: setTokensMock,
      unlockVault: unlockVaultMock,
      logout: logoutMock,
    }),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client }, children)
}

const accountId = '00112233-4455-4677-8899-aabbccddeeff'
const kdfSalt = encodeBase64Url(new Uint8Array(16).fill(1))
const accountSecret = encodeBase64Url(new Uint8Array(32).fill(2))
const authResponse = {
  accessToken: 'access',
  refreshToken: 'refresh',
  userId: accountId,
  isOnboarded: true,
}

describe('usePasswordLogin Identity KDF v2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchLoginKdfMock.mockResolvedValue({
      accountId,
      profileId: 'identity-argon2id-account-secret-v2',
      securityVersion: 2,
      kdfSalt,
      memoryKiB: 32_768,
      iterations: 2,
      parallelism: 1,
      accountSecretRequired: true,
    })
    deriveIdentityV2Mock.mockResolvedValue({
      authCredential: new Uint8Array(32).fill(3),
      masterKey: new Uint8Array(32).fill(4),
    })
    decryptWithKeyMock.mockResolvedValue(new Uint8Array(32).fill(5))
    getAccountMock.mockResolvedValue({
      userId: accountId,
      encryptedPrivateKey: encodeBase64Url(new Uint8Array(72).fill(6)),
      kdf: {
        securityVersion: 2,
        minimumSecurityVersion: 2,
        profileId: 'identity-argon2id-account-secret-v2',
        kdfSalt,
      },
    })
    totpLoginMock.mockResolvedValue(authResponse)
  })

  it('derives once before TOTP and reuses only the in-memory result after the challenge', async () => {
    passwordLoginMock.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })

    let startResult: Awaited<ReturnType<typeof result.current.start.mutateAsync>>
    await act(async () => {
      startResult = await result.current.start.mutateAsync({
        email: 'user@example.com',
        password: 'correct horse battery staple',
        accountSecret,
      })
    })
    expect(startResult!).toEqual({ kind: 'totp', challengeToken: 'challenge' })

    await act(async () => {
      await result.current.submitTotp.mutateAsync({
        challengeToken: 'challenge',
        code: '123456',
        password: 'correct horse battery staple',
      })
    })

    expect(deriveIdentityV2Mock).toHaveBeenCalledOnce()
    expect(unlockVaultMock).toHaveBeenCalledOnce()
    expect(logoutMock).not.toHaveBeenCalled()
  })

  it('fails closed and clears the session when authenticated KDF state is downgraded', async () => {
    passwordLoginMock.mockResolvedValue(authResponse)
    getAccountMock.mockResolvedValueOnce({
      userId: accountId,
      encryptedPrivateKey: encodeBase64Url(new Uint8Array(72).fill(6)),
      kdf: {
        securityVersion: 1,
        minimumSecurityVersion: 1,
        profileId: 'identity-argon2id-legacy-v1',
        kdfSalt,
      },
    })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })

    await act(async () => {
      await expect(result.current.start.mutateAsync({
        email: 'user@example.com',
        password: 'correct horse battery staple',
        accountSecret,
      })).rejects.toThrow('security-version-downgrade')
    })

    expect(unlockVaultMock).not.toHaveBeenCalled()
    expect(logoutMock).toHaveBeenCalledOnce()
  })
})
