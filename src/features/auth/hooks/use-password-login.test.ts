import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { usePasswordLogin } from './use-password-login'
import { captureManualUnlockFence } from '../session/manual-unlock-attempt'

const profileCleanup = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/lib/client-profile-cleanup', () => ({ runClientProfileCleanups: profileCleanup }))

const fetchLoginKdf = vi.hoisted(() => vi.fn())
const passwordLogin = vi.hoisted(() => vi.fn())
const totpLogin = vi.hoisted(() => vi.fn())
const deriveIdentityV1 = vi.hoisted(() => vi.fn())
const decryptWithKey = vi.hoisted(() => vi.fn())
const getAccount = vi.hoisted(() => vi.fn())
const setTokens = vi.hoisted(() => vi.fn())
const unlockVault = vi.hoisted(() => vi.fn())
const logout = vi.hoisted(() => vi.fn())
const prepareManualSharedUnlock = vi.hoisted(() => vi.fn())

vi.mock('../shared-unlock/manual-source', () => ({ prepareManualSharedUnlock }))

vi.mock('../api/auth-api', () => ({ fetchLoginKdf, passwordLogin, totpLogin,
  isTotpRequired: (response: { totpRequired?: boolean }) => response.totpRequired === true }))
vi.mock('../../../shared/api/account-api', () => ({ getAccount }))
vi.mock('../../../shared/crypto/identity-kdf', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/identity-kdf')>(), deriveIdentityV1,
}))
vi.mock('../../../shared/crypto/sodium', () => ({ decryptWithKey, wipe: vi.fn() }))
vi.mock('../stores/auth-store', () => ({ useAuthStore: { subscribe: () => () => {}, getState: () => ({
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
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    vi.clearAllMocks()
    profileCleanup.mockResolvedValue(undefined)
    fetchLoginKdf.mockResolvedValue(profile)
    deriveIdentityV1.mockResolvedValue({ authCredential: new Uint8Array(32).fill(3), masterKey: new Uint8Array(32).fill(4) })
    decryptWithKey.mockResolvedValue(new Uint8Array(32).fill(5))
    getAccount.mockResolvedValue({ userId: accountId, encryptedPrivateKey: encodeBase64Url(new Uint8Array(72).fill(6)),
      kdf: { ...profile, minimumSecurityVersion: 1 } })
    totpLogin.mockResolvedValue(response)
  })

  it('blocks receivers synchronously while profile cleanup is pending, before any KDF request', async () => {
    let release!: () => void
    profileCleanup.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve }))
    passwordLogin.mockResolvedValue(response)
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    const login = result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' })
    try {
      expect(captureManualUnlockFence()()).toBe(false)
      await Promise.resolve()
      expect(fetchLoginKdf).not.toHaveBeenCalled()
    } finally { release?.(); await login }
    expect(captureManualUnlockFence()()).toBe(true)
  })

  it('keeps receiver admission closed between TOTP mutations and after a retryable code failure', async () => {
    passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    totpLogin.mockRejectedValueOnce(new Error('invalid-code'))
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' })
    expect(captureManualUnlockFence()()).toBe(false)
    await expect(result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: 'bad' })).rejects.toThrow('invalid-code')
    expect(captureManualUnlockFence()()).toBe(false)
    await result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: '123456' })
    expect(captureManualUnlockFence()()).toBe(true)
  })

  it('does not accept a TOTP response beyond the wall-clock ceiling when timers were suspended', async () => {
    vi.useFakeTimers()
    passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' })
    vi.setSystemTime(Date.now() + 5 * 60_000)
    await expect(result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: '123456' })).rejects.toThrow()
    expect(totpLogin).not.toHaveBeenCalled()
    expect(captureManualUnlockFence()()).toBe(true)
  })

  it('releases admission after failed profile cleanup without starting credential work', async () => {
    profileCleanup.mockRejectedValueOnce(new Error('cleanup failed'))
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await expect(result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' })).rejects.toThrow('cleanup failed')
    expect(fetchLoginKdf).not.toHaveBeenCalled()
    expect(captureManualUnlockFence()()).toBe(true)
  })

  it('does not release a newer TOTP owner when an old cancelled cleanup finishes', async () => {
    let release!: () => void
    profileCleanup.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve }))
    passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    const old = result.current.start.mutateAsync({ email: 'old@example.com', password: 'pw' })
    const rejected = expect(old).rejects.toThrow('Unlock attempt cancelled')
    await result.current.start.mutateAsync({ email: 'new@example.com', password: 'pw' })
    release(); await rejected
    expect(captureManualUnlockFence()()).toBe(false)
    expect(fetchLoginKdf).toHaveBeenCalledExactlyOnceWith('new@example.com', 'identity-argon2id-password-v1')
    result.current.cancel()
    expect(captureManualUnlockFence()()).toBe(true)
  })

  it('derives once before TOTP and reuses the in-memory master key', async () => {
    passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await act(async () => { await result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' }) })
    await act(async () => { await result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: '123456' }) })
    expect(deriveIdentityV1).toHaveBeenCalledOnce()
    expect(unlockVault).toHaveBeenCalledOnce()
    expect(prepareManualSharedUnlock).toHaveBeenCalledWith(expect.objectContaining({ userId: accountId }), new Uint8Array(32).fill(3))
  })

  it('does not send the proof to sharing before the second factor is accepted', async () => {
    passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    totpLogin.mockRejectedValueOnce(new Error('invalid-code'))
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' })
    expect(prepareManualSharedUnlock).not.toHaveBeenCalled()
    await expect(result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: 'bad' })).rejects.toThrow('invalid-code')
    expect(prepareManualSharedUnlock).not.toHaveBeenCalled()
    await result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: '123456' })
    expect(prepareManualSharedUnlock).toHaveBeenCalledOnce()
  })

  for (const end of ['cancel', 'timeout', 'unmount'] as const) {
    it(`cannot use a pending TOTP proof after ${end}`, async () => {
      vi.useFakeTimers()
      passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
      const { result, unmount } = renderHook(() => usePasswordLogin(), { wrapper })
      await result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' })
      if (end === 'cancel') result.current.cancel()
      else if (end === 'unmount') unmount()
      else await vi.advanceTimersByTimeAsync(5 * 60_000)
      await expect(result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: '123456' })).rejects.toThrow('Missing pending login state')
      expect(totpLogin).not.toHaveBeenCalled()
      expect(unlockVault).not.toHaveBeenCalled()
      expect(prepareManualSharedUnlock).not.toHaveBeenCalled()
    })
  }

  it('does not install a successful TOTP response received after cancellation', async () => {
    let resolve!: (value: typeof response) => void
    passwordLogin.mockResolvedValue({ totpRequired: true, challengeToken: 'challenge' })
    totpLogin.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' })
    const submitting = result.current.submitTotp.mutateAsync({ challengeToken: 'challenge', code: '123456' })
    const rejected = expect(submitting).rejects.toThrow('Expired pending login state')
    await vi.waitFor(() => expect(totpLogin).toHaveBeenCalledOnce())
    result.current.cancel()
    resolve(response)
    await rejected
    expect(setTokens).not.toHaveBeenCalled()
    expect(unlockVault).not.toHaveBeenCalled()
  })

  it('does not restore tokens when an older password login finishes after a new attempt', async () => {
    let resolve!: (value: typeof response) => void
    passwordLogin.mockReturnValueOnce(new Promise(r => { resolve = r }))
      .mockResolvedValueOnce(response)
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    const old = result.current.start.mutateAsync({ email: 'old@example.com', password: 'pw' })
    const rejected = expect(old).rejects.toThrow('Unlock attempt cancelled')
    await vi.waitFor(() => expect(passwordLogin).toHaveBeenCalledOnce())
    await result.current.start.mutateAsync({ email: 'current@example.com', password: 'pw' })
    resolve(response)
    await rejected
    expect(setTokens).toHaveBeenCalledOnce()
    expect(unlockVault).toHaveBeenCalledOnce()
    expect(logout).toHaveBeenCalledTimes(2)
  })

  it('fails closed when authenticated KDF state is downgraded', async () => {
    passwordLogin.mockResolvedValue(response)
    getAccount.mockResolvedValueOnce({ userId: accountId, encryptedPrivateKey: encodeBase64Url(new Uint8Array(72).fill(6)),
      kdf: { ...profile, securityVersion: 0, minimumSecurityVersion: 0 } })
    const { result } = renderHook(() => usePasswordLogin(), { wrapper })
    await expect(result.current.start.mutateAsync({ email: 'u@example.com', password: 'pw' }))
      .rejects.toThrow('security-version-downgrade')
    expect(logout).toHaveBeenCalledTimes(2)
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
