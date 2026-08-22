import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { usePasswordLogin } from './use-password-login'

const fetchLoginKdf = vi.hoisted(() => vi.fn())
const passwordLogin = vi.hoisted(() => vi.fn())
const totpLogin = vi.hoisted(() => vi.fn())
const deriveIdentityV1 = vi.hoisted(() => vi.fn())
const decryptWithKey = vi.hoisted(() => vi.fn())
const getAccount = vi.hoisted(() => vi.fn())
const setTokens = vi.hoisted(() => vi.fn())
const unlockVault = vi.hoisted(() => vi.fn())
const logout = vi.hoisted(() => vi.fn())

vi.mock('../api/auth-api', () => ({ fetchLoginKdf, passwordLogin, totpLogin,
  isTotpRequired: (response: { totpRequired?: boolean }) => response.totpRequired === true }))
vi.mock('../../../shared/api/account-api', () => ({ getAccount }))
vi.mock('../../../shared/crypto/identity-kdf', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/identity-kdf')>(), deriveIdentityV1,
}))
vi.mock('../../../shared/crypto/sodium', () => ({ decryptWithKey, wipe: vi.fn() }))
vi.mock('../stores/auth-store', () => ({ useAuthStore: { getState: () => ({
  setTokens, unlockVault, logout,
}) } }))

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children)
}

const accountId = '00112233-4455-4677-8899-aabbccddeeff'
const kdfSalt = encodeBase64Url(new Uint8Array(16).fill(1))
const profile = { accountId, profileId: 'identity-argon2id-password-v1', securityVersion: 1,
  kdfSalt, memoryKiB: 32_768, iterations: 2, parallelism: 1 }
const response = { accessToken: 'a', refreshToken: 'r', userId: accountId, isOnboarded: true }

describe('usePasswordLogin password KDF v1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchLoginKdf.mockResolvedValue(profile)
    deriveIdentityV1.mockResolvedValue({ authCredential: new Uint8Array(32).fill(3), masterKey: new Uint8Array(32).fill(4) })
    decryptWithKey.mockResolvedValue(new Uint8Array(32).fill(5))
    getAccount.mockResolvedValue({ userId: accountId, encryptedPrivateKey: encodeBase64Url(new Uint8Array(72).fill(6)),
      kdf: { ...profile, minimumSecurityVersion: 1 } })
    totpLogin.mockResolvedValue(response)
  })

  it('derives once before TOTP and reuses the in-memory master key', async () => {
    passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await act(async () => { await result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' }) })
    await act(async () => { await result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: '123456' }) })
    expect(deriveIdentityV1).toHaveBeenCalledOnce()
    expect(unlockVault).toHaveBeenCalledOnce()
  })

  it('fails closed when authenticated KDF state is downgraded', async () => {
    passwordLogin.mockResolvedValue(response)
    getAccount.mockResolvedValueOnce({ userId: accountId, encryptedPrivateKey: encodeBase64Url(new Uint8Array(72).fill(6)),
      kdf: { ...profile, securityVersion: 0, minimumSecurityVersion: 0 } })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await expect(result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' }))
      .rejects.toThrow('security-version-downgrade')
    expect(logout).toHaveBeenCalledOnce()
  })

  it('derives and calls login for an unknown account pseudo-bootstrap', async () => {
    const pseudoAccountId = 'ffeeddcc-bbaa-4a99-8877-665544332211'
    fetchLoginKdf.mockResolvedValue({ ...profile, accountId: pseudoAccountId })
    passwordLogin.mockRejectedValue(new Error('invalid-credentials'))
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })

    await expect(result.current.start.mutateAsync({
      email: 'unknown@example.com',
      password: 'password',
    })).rejects.toThrow('invalid-credentials')

    expect(deriveIdentityV1).toHaveBeenCalledWith(
      'password',
      pseudoAccountId,
      expect.any(Uint8Array),
    )
    expect(passwordLogin).toHaveBeenCalledOnce()
  })
})
