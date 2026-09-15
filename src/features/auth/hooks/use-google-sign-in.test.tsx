import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthLoginAttempt } from './use-login'
import { useGoogleSignIn } from './use-google-sign-in'
import { useAuthStore } from '../stores/auth-store'
import { beginManualUnlockAttempt, captureManualUnlockFence } from '../session/manual-unlock-attempt'

interface SdkOptions {
  onSuccess(response: { access_token: string; state?: string }): void
  onError(response: { error: string; state?: string }): void
  onNonOAuthError(error: { type: string }): void
}
const sdk = vi.hoisted(() => ({ options: null as SdkOptions | null, open: vi.fn() }))
const mutate = vi.hoisted(() => vi.fn<(input: OAuthLoginAttempt) => void>())
const cleanup = vi.hoisted(() => vi.fn<() => Promise<void>>())
vi.mock('@react-oauth/google', () => ({ useGoogleLogin: (options: SdkOptions) => { sdk.options = options; return sdk.open } }))
vi.mock('./use-login', () => ({ useLogin: () => ({ mutate, isPending: false, isError: false }) }))
vi.mock('../session/client-session', async () => ({
  ...await vi.importActual('../session/client-session'), clearClientSession: cleanup,
}))
const lastState = (): string => sdk.open.mock.calls.at(-1)![0].state
const success = (state = lastState()) => sdk.options!.onSuccess({ state, access_token: 'synthetic-google-token' })
beforeEach(() => {
  useAuthStore.getState().logout(); beginManualUnlockAttempt().cancel()
  vi.clearAllMocks(); cleanup.mockResolvedValue(undefined)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); useAuthStore.getState().logout(); beginManualUnlockAttempt().cancel() })

describe('whole Google popup attempt', () => {
  it('blocks new receivers before cleanup settles and until the exchange finishes', async () => {
    let release!: () => void
    cleanup.mockReturnValue(new Promise(resolve => { release = resolve }))
    const { result } = renderHook(() => useGoogleSignIn('/vaults'))
    act(() => { result.current.start() })
    expect(result.current.isPending).toBe(true)
    expect(captureManualUnlockFence()()).toBe(false)
    expect(sdk.open).not.toHaveBeenCalled()
    await act(async () => { release() })
    expect(sdk.open).toHaveBeenCalledOnce()
    act(() => { result.current.start(); success(); success() })
    expect(sdk.open).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenCalledOnce()
    expect(result.current.isPending).toBe(true)
    const attempt = mutate.mock.calls[0][0]
    expect(attempt.googleToken).toBe('synthetic-google-token')
    expect(attempt.assertCurrent).not.toThrow()
    act(() => { attempt.finish() })
    expect(result.current.isPending).toBe(false)
    expect(captureManualUnlockFence()()).toBe(true)
    expect(attempt.assertCurrent).toThrow()
  })

  it('allows retry after popup close and ignores a response belonging to the older popup', async () => {
    const { result } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    const first = lastState()
    act(() => { sdk.options!.onNonOAuthError({ type: 'popup_closed' }) })
    expect(result.current.googleError).toBe(false)
    expect(captureManualUnlockFence()()).toBe(true)
    await act(async () => { result.current.start() })
    expect(lastState()).not.toBe(first)
    act(() => { success(first); sdk.options!.onError({ error: 'access_denied', state: first }) })
    expect(mutate).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)
    expect(captureManualUnlockFence()()).toBe(false)
    act(() => { success() })
    expect(mutate).toHaveBeenCalledOnce()
  })

  it('does not reinterpret a response missing the original request state', async () => {
    const { result } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    act(() => { sdk.options!.onSuccess({ access_token: 'synthetic-google-token' }) })
    expect(mutate).not.toHaveBeenCalled()
    expect(captureManualUnlockFence()()).toBe(false)
  })

  it('cancels on unmount and cannot exchange a late SDK response', async () => {
    const { result, unmount } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    const state = lastState()
    unmount()
    expect(captureManualUnlockFence()()).toBe(true)
    success(state)
    expect(mutate).not.toHaveBeenCalled()
  })

  it('rejects the popup callback after a newer account acquires keys', async () => {
    const { result } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    act(() => {
      beginManualUnlockAttempt()
      useAuthStore.getState().setTokens({ accessToken: 'synthetic-a', refreshToken: 'synthetic-r',
        userId: '11111111-1111-4111-8111-111111111111', isOnboarded: true })
      useAuthStore.getState().unlockVault(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2))
      success()
    })
    expect(mutate).not.toHaveBeenCalled()
    expect(useAuthStore.getState().masterKey).toEqual(new Uint8Array(32).fill(1))
    expect(result.current.isPending).toBe(false)
  })

  it('cannot release a newer popup from an older backend completion', async () => {
    const { result } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    act(() => { success() })
    const old = mutate.mock.calls[0][0]
    act(() => { result.current.cancel() })
    await act(async () => { result.current.start() })
    act(() => { old.finish() })
    expect(result.current.isPending).toBe(true)
    expect(captureManualUnlockFence()()).toBe(false)
    expect(old.assertCurrent).toThrow()
  })

  it('releases the barrier if profile cleanup fails before opening the popup', async () => {
    cleanup.mockRejectedValue(new Error('cleanup failed'))
    const { result } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    expect(sdk.open).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(false)
    expect(result.current.googleError).toBe(true)
    expect(captureManualUnlockFence()()).toBe(true)
  })

  it('expires a lost popup callback without requiring the browser timer to run', async () => {
    const { result } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60_000)
    act(() => { success() })
    expect(mutate).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(false)
    expect(captureManualUnlockFence()()).toBe(true)
  })

  it('clears an abandoned popup after the bounded timer', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useGoogleSignIn('/'))
    await act(async () => { result.current.start() })
    act(() => { vi.advanceTimersByTime(5 * 60_000) })
    expect(result.current.isPending).toBe(false)
    expect(result.current.googleError).toBe(true)
    expect(captureManualUnlockFence()()).toBe(true)
  })
})
