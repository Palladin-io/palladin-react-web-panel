import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { useShareReception } from './use-share-reception'
import { captureEntryShareIngress, clearPendingEntryShare, readPendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import { entryShareFragment } from '../../../shared/crypto/entry-share-link'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'
import * as sharingCrypto from '../../../shared/crypto/entry-share'
import { guardReceptionContinuation } from './reception-continuation'
import { duringManualLoginCleanup } from '../../../shared/lib/manual-login-cleanup'

const api = vi.hoisted(() => ({ open: vi.fn(), otp: vi.fn(), verifyOtp: vi.fn(), secret: vi.fn(), receive: vi.fn(), confirm: vi.fn(), end: vi.fn() }))
vi.mock('./recipient-api', () => ({ openRecipientSession: api.open, requestRecipientOtp: api.otp,
  verifyRecipientOtp: api.verifyOtp, verifyRecipientSecret: api.secret, receiveEntryShare: api.receive,
  confirmRecipientDisplay: api.confirm, endRecipientShare: api.end }))
const shareId = fixture.scope.shareId
const session = { sessionId: '44442233-4455-4677-8899-aabbccddeeff', sessionToken: 's'.repeat(43),
  recipientMode: 'anyoneWithLink', protection: 'none' }

function capture() {
  const fragment = entryShareFragment({ key: Uint8Array.from({ length: 32 }, (_, i) => i), accessToken: new Uint8Array(32).fill(7) })
  window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
  captureEntryShareIngress(window)
}

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ userId: null, accessToken: null, refreshToken: null, privateKey: null, isVaultLocked: true, cryptoSessionGeneration: 0 })
  capture()
  api.open.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 900_000).toISOString() })
  api.otp.mockResolvedValue({ retryAfterSeconds: 0 })
  api.receive.mockResolvedValue({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext })
})
afterEach(() => { cleanup(); clearPendingEntryShare(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('Guest Entry sharing reception', () => {
  it('keeps the sender policy separate from the short recipient session', async () => {
    const shareExpiresAt = new Date(Date.now() + 86_400_000).toISOString()
    api.open.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 900_000).toISOString(), shareExpiresAt, maximumReceipts: 3 })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    expect(result.current.shareExpiresAt).toBe(shareExpiresAt)
    expect(result.current.maximumReceipts).toBe(3)
    expect(api.receive).not.toHaveBeenCalled()
  })

  it('does not substitute session expiry or guess a limit when display metadata is absent', async () => {
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    expect(result.current.shareExpiresAt).toBeNull()
    expect(result.current.maximumReceipts).toBeNull()
    await act(async () => { await result.current.requestOtp('en') })
    expect(api.otp).not.toHaveBeenCalled()
  })

  it('waits for the shared cooldown, counts down, and sends only on explicit action at the boundary', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] })
    clearPendingEntryShare(); capture()
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString(), otpRetryAfterSeconds: 3 })
    api.otp.mockResolvedValue({ retryAfterSeconds: 60 })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.requestOtp('en') })
    expect(result.current.otpRetryAfterSeconds).toBe(3)
    expect(result.current.otpRequested).toBe(false)
    expect(api.otp).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(result.current.otpRetryAfterSeconds).toBe(2)
    await act(async () => { vi.advanceTimersByTime(1999); await result.current.requestOtp('en') })
    expect(api.otp).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1); await result.current.requestOtp('en') })
    expect(api.otp).toHaveBeenCalledOnce()
    expect(result.current.otpRetryAfterSeconds).toBe(60)
    await act(async () => { await result.current.requestOtp('pl') })
    expect(api.otp).toHaveBeenCalledOnce()
    await act(async () => { await result.current.verifyOtp('654321') })
    expect(result.current.otpRetryAfterSeconds).toBe(0)
    expect(result.current.emailVerified).toBe(true)
    expect(api.receive).not.toHaveBeenCalled()
  })

  it('restores the remaining cooldown after account continuation without restarting it in StrictMode', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] })
    clearPendingEntryShare(); capture()
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.otp.mockResolvedValue({ retryAfterSeconds: 60 })
    const original = renderHook(() => useShareReception(shareId))
    await act(async () => { await original.result.current.open(); await original.result.current.requestOtp('en') })
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    act(() => {
      guardReceptionContinuation(`/login?redirect=${encodeURIComponent(`/share/${shareId}`)}`)
      vi.advanceTimersByTime(21_500)
    })
    const returned = renderHook(() => useShareReception(shareId), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> })
    expect(returned.result.current.otpRetryAfterSeconds).toBe(39)
    expect(returned.result.current.otpRequested).toBe(true)
    await act(async () => { await returned.result.current.requestOtp('en') })
    expect(api.otp).toHaveBeenCalledOnce()
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(returned.result.current.otpRetryAfterSeconds).toBe(38)
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).not.toHaveBeenCalled()
  })

  it('uses the residual cooldown from an idempotent retry, not a fresh minute', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] })
    clearPendingEntryShare(); capture()
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.otp.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ retryAfterSeconds: 39 })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.requestOtp('en') })
    expect(result.current.otpRetry).toBe(true)
    await act(async () => { vi.advanceTimersByTime(21_500); await result.current.requestOtp('en') })
    expect(api.otp.mock.calls.map((call) => call[2])).toEqual([1, 1])
    expect(result.current.otpRetryAfterSeconds).toBe(39)
    expect(result.current.otpRetry).toBe(false)
    await act(async () => { await result.current.requestOtp('en') })
    expect(api.otp).toHaveBeenCalledTimes(2)
  })

  it('allows explicit resend after monotonic expiry despite wall-clock rollback and suspended UI timers', async () => {
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100)
    capture()
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString(), otpRetryAfterSeconds: 60 })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 3_600_000)
    monotonic.mockReturnValue(60_100)
    await act(async () => { await result.current.requestOtp('en') })
    expect(api.otp).toHaveBeenCalledOnce()
    expect(result.current.otpRetryAfterSeconds).toBe(0)
  })

  it('discards a late OTP response and the countdown when the local capability is cleared', async () => {
    let complete!: (value: { retryAfterSeconds: number }) => void
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.otp.mockReturnValue(new Promise((resolve) => { complete = resolve }))
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    let request!: ReturnType<typeof result.current.requestOtp>
    act(() => { request = result.current.requestOtp('en') })
    act(() => { result.current.forget() })
    await act(async () => { complete({ retryAfterSeconds: 60 }); expect(await request).toBe('cancelled') })
    expect(result.current.phase).toBe('unavailable')
    expect(result.current.otpRetryAfterSeconds).toBe(0)
    expect(result.current.otpRequested).toBe(false)
  })

  it.each(['login', 'register', 'unlock', 'verify-email'])('retains the explicit continuation through the clean %s route', (gate) => {
    const original = renderHook(() => useShareReception(shareId))
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    act(() => guardReceptionContinuation(`/${gate}?redirect=${encodeURIComponent(`/share/${shareId}`)}`))
    const returned = renderHook(() => useShareReception(shareId))
    expect(returned.result.current.phase).toBe('welcome')
    expect(api.open).not.toHaveBeenCalled()
    expect(api.receive).not.toHaveBeenCalled()
  })

  it.each([
    `/login?redirect=${encodeURIComponent(`/share/${shareId}#key=do-not-keep`)}`,
    `/login?redirect=${encodeURIComponent(`/share/${shareId}`)}&extra=unexpected`,
    `/login?redirect=${encodeURIComponent(`/share/${shareId}`)}&redirect=/vaults`,
    `/login?redirect=${encodeURIComponent(`/share/${shareId}`)}#unexpected`,
    `/verify-email?token=external-document&redirect=${encodeURIComponent(`/share/${shareId}`)}`,
    'https://outside.example.test/login',
    '/login?redirect=/share/11112233-4455-4677-8899-aabbccddeeff',
  ])('clears continuation outside the exact clean auth route: %s', (href) => {
    const original = renderHook(() => useShareReception(shareId))
    const link = readPendingEntryShare(shareId)!
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    act(() => guardReceptionContinuation(href))
    const returned = renderHook(() => useShareReception(shareId))
    expect(returned.result.current.phase).toBe('unavailable')
    expect(link.key).toEqual(new Uint8Array(32))
  })

  it('does not extend the manual-cleanup exception across an await', async () => {
    const original = renderHook(() => useShareReception(shareId))
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    await act(async () => {
      await duringManualLoginCleanup(async () => {
        useAuthStore.getState().logout()
        await Promise.resolve()
        useAuthStore.getState().logout()
      })
    })
    expect(readPendingEntryShare(shareId)).toBeNull()
  })

  it('binds the first authenticated organization and cancels if it changes during unlock', () => {
    const jwt = (organizationId: string) => `e30.${btoa(JSON.stringify({ org_id: organizationId }))}.signature`
    const original = renderHook(() => useShareReception(shareId))
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    act(() => {
      useAuthStore.setState({ userId: 'recipient', accessToken: jwt('00112233-4455-4677-8899-aabbccddeeff') })
      useAuthStore.setState({ accessToken: jwt('11112233-4455-4677-8899-aabbccddeeff') })
    })
    expect(readPendingEntryShare(shareId)).toBeNull()
  })

  it('discards the old retained snapshot without clearing a newly opened link', async () => {
    const original = renderHook(() => useShareReception(shareId))
    await act(async () => { await original.result.current.open(); await original.result.current.receive() })
    const link = readPendingEntryShare(shareId)!
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    act(() => capture())
    const returned = renderHook(() => useShareReception(shareId))
    expect(returned.result.current.phase).toBe('welcome')
    expect(returned.result.current.snapshot).toBeNull()
    expect(readPendingEntryShare(shareId)).not.toBe(link)
    expect(link.key).toEqual(new Uint8Array(32))
  })

  it.each([false, true])('keeps the exact receipt through explicit login and remount (StrictMode=%s)', async (strict) => {
    const original = renderHook(() => useShareReception(shareId))
    await act(async () => { await original.result.current.open(); await original.result.current.receive() })
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    await act(async () => {
      guardReceptionContinuation(`/login?redirect=${encodeURIComponent(`/share/${shareId}`)}`)
      duringManualLoginCleanup(() => useAuthStore.getState().logout())
      useAuthStore.getState().setTokens({ userId: 'recipient', accessToken: 'test-access', refreshToken: 'test-refresh', isOnboarded: true })
      useAuthStore.getState().unlockVault(new Uint8Array(32), new Uint8Array(32))
    })
    const returned = renderHook(() => useShareReception(shareId), strict
      ? { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> } : undefined)
    await act(async () => { await returned.result.current.open(); await returned.result.current.receive(); await returned.result.current.confirmDisplay() })
    expect(returned.result.current.snapshot).toEqual(fixture.snapshot)
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).toHaveBeenCalledOnce()
  })

  it('preserves the pre-receipt verification gates through registration without consuming a receipt', async () => {
    const original = renderHook(() => useShareReception(shareId))
    await act(async () => { await original.result.current.open() })
    act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
    original.unmount()
    act(() => {
      guardReceptionContinuation(`/register?redirect=${encodeURIComponent(`/share/${shareId}`)}`)
      useAuthStore.getState().setTokens({ userId: 'new-recipient', accessToken: 'test-access', refreshToken: 'test-refresh', isOnboarded: true })
      useAuthStore.getState().unlockVault(new Uint8Array(32), new Uint8Array(32))
    })
    const returned = renderHook(() => useShareReception(shareId))
    expect(returned.result.current.phase).toBe('verification')
    expect(api.receive).not.toHaveBeenCalled()
    await act(async () => { await returned.result.current.receive() })
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it.each(['logout', 'lock', 'account', 'route', 'pagehide', 'expiry'] as const)(
    'disposes the detached receipt on %s', async (reason) => {
      const original = renderHook(() => useShareReception(shareId))
      await act(async () => { await original.result.current.open(); await original.result.current.receive() })
      const held = readPendingEntryShare(shareId)!
      act(() => { expect(original.result.current.continueToAccount()).toBe(true) })
      original.unmount()
      act(() => {
        if (reason === 'logout') useAuthStore.getState().logout()
        else if (reason === 'lock') useAuthStore.getState().lockVault()
        else if (reason === 'account') {
          useAuthStore.setState({ userId: 'first' })
          useAuthStore.setState({ userId: 'second' })
        } else if (reason === 'route') guardReceptionContinuation('/vaults')
        else if (reason === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
        else vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 900_001)
      })
      const returned = renderHook(() => useShareReception(shareId))
      expect(returned.result.current.snapshot).toBeNull()
      expect(returned.result.current.phase).toBe('unavailable')
      expect(held.key).toEqual(new Uint8Array(32))
    },
  )

  it('does not transfer an in-flight delivery to the auth route', async () => {
    let finish!: (packet: unknown) => void
    api.receive.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const original = renderHook(() => useShareReception(shareId))
    await act(async () => { await original.result.current.open() })
    let receiving!: Promise<unknown>
    act(() => { receiving = original.result.current.receive() })
    expect(original.result.current.continueToAccount()).toBe(false)
    original.unmount()
    await act(async () => { finish({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext }); await receiving })
    expect(readPendingEntryShare(shareId)).toBeNull()
  })

  it('does not call any endpoint on mount and survives StrictMode without losing the key', async () => {
    const { result } = renderHook(() => useShareReception(shareId), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> })
    await act(async () => {})
    expect(api.open).not.toHaveBeenCalled()
    expect(readPendingEntryShare(shareId)?.key[1]).toBe(1)
    await act(async () => { expect(await result.current.open()).toBe('ok') })
    expect(result.current.phase).toBe('verification')
    expect(api.receive).not.toHaveBeenCalled()
    expect(api.otp).not.toHaveBeenCalled()
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('opens the independently generated snapshot and confirms only after a separate display signal', async () => {
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.receive() })
    expect(result.current.snapshot).toEqual(fixture.snapshot)
    expect(api.confirm).not.toHaveBeenCalled()
    await act(async () => { await result.current.confirmDisplay(); await result.current.confirmDisplay() })
    expect(api.confirm).toHaveBeenCalledOnce()
    expect(result.current.confirmation).toBe('confirmed')
    await act(async () => { await result.current.receive() })
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it('requires both independent gates without allowing the PIN to satisfy email', async () => {
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', protection: 'pin', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.receive() })
    expect(result.current.canReceive).toBe(false)
    expect(api.receive).not.toHaveBeenCalled()
    await act(async () => { await result.current.verifySecret('123456'); await result.current.receive() })
    expect(result.current.canReceive).toBe(false)
    expect(api.receive).not.toHaveBeenCalled()
    await act(async () => { await result.current.requestOtp('pl'); await result.current.verifyOtp('654321') })
    expect(result.current.canReceive).toBe(true)
    await act(async () => { await result.current.receive() })
    expect(result.current.snapshot).toEqual(fixture.snapshot)
  })

  it('retries the same OTP generation after an ambiguous response and only then advances for resend', async () => {
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.otp.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); expect(await result.current.requestOtp('en')).toBe('failed') })
    expect(result.current.otpRetry).toBe(true)
    await act(async () => { await result.current.requestOtp('en'); await result.current.requestOtp('pl') })
    expect(api.otp.mock.calls.map((call) => call[2])).toEqual([1, 1, 2])
    expect(result.current.otpRetry).toBe(false)
  })

  it('retains the same session for a lost delivery response', async () => {
    api.receive.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); expect(await result.current.receive()).toBe('failed') })
    await act(async () => { await result.current.receive() })
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive.mock.calls[1][1]).toBe(api.receive.mock.calls[0][1])
    expect(result.current.snapshot).toEqual(fixture.snapshot)
  })

  it('keeps plaintext after a failed confirmation and retries only the confirmation', async () => {
    api.confirm.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.receive(); await result.current.confirmDisplay() })
    expect(result.current.confirmation).toBe('failed')
    expect(result.current.snapshot).toEqual(fixture.snapshot)
    await act(async () => { await result.current.confirmDisplay() })
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).toHaveBeenCalledTimes(2)
  })

  it.each(['ciphertext', 'shareId', 'organizationId'])('fails closed before publication on tampered %s', async (coordinate) => {
    api.receive.mockResolvedValue({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext,
      [coordinate]: coordinate === 'ciphertext' ? 'AAAA' : session.sessionId })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.receive(); await result.current.confirmDisplay() })
    expect(result.current.snapshot).toBeNull()
    expect(result.current.phase).toBe('unavailable')
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('discards late delivery and aborts transport after lock generation changes', async () => {
    let finish!: (packet: unknown) => void
    api.receive.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    let receiving!: Promise<unknown>
    act(() => { receiving = result.current.receive() })
    const held = readPendingEntryShare(shareId)!
    act(() => useAuthStore.setState({ cryptoSessionGeneration: 1 }))
    await act(async () => { finish({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext }); expect(await receiving).toBe('cancelled') })
    expect(api.receive.mock.calls[0][2].aborted).toBe(true)
    expect(held.key).toEqual(new Uint8Array(32))
    expect(result.current.snapshot).toBeNull()
  })

  it('clears decoded content on pagehide', async () => {
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.receive() })
    act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    expect(result.current.snapshot).toBeNull()
    expect(result.current.phase).toBe('unavailable')
  })

  it('does not erase a newer link when an old asynchronous decrypt fails', async () => {
    let fail!: (error: Error) => void
    const opening = vi.spyOn(sharingCrypto, 'openEntryShare').mockReturnValue(new Promise((_resolve, reject) => { fail = reject }))
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    let receiving!: Promise<unknown>
    await act(async () => { receiving = result.current.receive(); await Promise.resolve() })
    expect(opening).toHaveBeenCalledOnce()
    act(() => capture())
    const newer = readPendingEntryShare(shareId)
    await act(async () => { fail(new Error('decrypt')); await receiving })
    expect(readPendingEntryShare(shareId)).toBe(newer)
    expect(newer?.key[1]).toBe(1)
  })

  it('enforces session expiry synchronously when timers have been suspended', async () => {
    api.open.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 1000).toISOString() })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000)
    await act(async () => { expect(await result.current.receive()).toBe('cancelled') })
    expect(api.receive).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('unavailable')
  })

  it('expires decoded content when the ingress timer fires', async () => {
    vi.useFakeTimers(); clearPendingEntryShare(); capture()
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.receive() })
    expect(result.current.snapshot).not.toBeNull()
    act(() => vi.advanceTimersByTime(900_000))
    expect(result.current.snapshot).toBeNull()
    expect(result.current.phase).toBe('unavailable')
  })

  it('does not prolong session authority after a wall-clock rollback', async () => {
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100)
    capture()
    api.open.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 1000).toISOString() })
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open() })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() - 3_600_000)
    monotonic.mockReturnValue(1200)
    await act(async () => { await result.current.receive() })
    expect(api.receive).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('unavailable')
  })

  it('does not treat failed verification as satisfying a gate', async () => {
    api.open.mockResolvedValue({ ...session, protection: 'pin', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.secret.mockRejectedValue(new Error('unavailable'))
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); expect(await result.current.verifySecret('123456')).toBe('failed'); await result.current.receive() })
    expect(result.current.secretVerified).toBe(false)
    expect(result.current.canReceive).toBe(false)
    expect(api.receive).not.toHaveBeenCalled()
  })

  it('does not expose recipient termination and retains the decoded local copy', async () => {
    const { result } = renderHook(() => useShareReception(shareId))
    await act(async () => { await result.current.open(); await result.current.receive() })
    expect(result.current).not.toHaveProperty('end')
    expect(result.current.phase).toBe('received')
    expect(result.current.snapshot).toEqual(fixture.snapshot)
    await act(async () => { await result.current.receive(); await result.current.confirmDisplay() })
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.end).not.toHaveBeenCalled()
    expect(api.confirm).toHaveBeenCalledOnce()
  })

  it('wipes ingress ownership on actual unmount', async () => {
    const { unmount } = renderHook(() => useShareReception(shareId))
    const held = readPendingEntryShare(shareId)!
    unmount()
    await act(async () => {})
    expect(readPendingEntryShare(shareId)).toBeNull()
    expect(held.key).toEqual(new Uint8Array(32))
  })
})
