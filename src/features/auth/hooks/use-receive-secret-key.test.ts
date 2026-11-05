import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sealSecretKeyForTransfer } from '../../../shared/crypto/device-transfer'
import { decodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { useReceiveSecretKey } from './use-receive-secret-key'

const api = vi.hoisted(() => ({ create: vi.fn(), claim: vi.fn(), cancel: vi.fn() }))
const store = vi.hoisted(() => vi.fn())
vi.mock('../api/auth-api', () => ({
  createSecretKeyTransfer: api.create, claimSecretKeyTransfer: api.claim, cancelSecretKeyTransferAsRecipient: api.cancel,
}))
vi.mock('../../../shared/crypto/secret-key', () => ({ storeDeviceSecretKey: store }))

const accountId = '11111111-1111-4111-8111-111111111111'
const transferId = '33333333-3333-4333-8333-333333333333'
const challenge = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc'
const secret = new Uint8Array(32).fill(5)
let relayedKey = ''

async function sealFor(recipientPublicKey: string, sessionAccountId = accountId) {
  return sealSecretKeyForTransfer({
    accountId: sessionAccountId, transferId, challenge, recipientPublicKey: decodeBase64Url(recipientPublicKey, 1216),
  }, true, secret)
}

describe('useReceiveSecretKey', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.create.mockImplementation(async (recipientPublicKey: string) => {
      relayedKey = recipientPublicKey
      return { transferId, challenge, pollToken: 'poll', expiresAt: new Date(Date.now() + 300_000).toISOString() }
    })
    api.claim.mockResolvedValue({ status: 'pending' })
    store.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

  it('shows a QR and code, then stores exactly the delivered Secret Key in the device wrapper', async () => {
    const onReceived = vi.fn()
    const { result } = renderHook(() => useReceiveSecretKey(accountId, onReceived))
    await vi.waitFor(() => expect(result.current.state.step).toBe('waiting'))
    const envelope = await sealFor(relayedKey)
    api.claim.mockResolvedValueOnce({ status: 'delivered', accountId, ...envelope })
    await act(() => vi.advanceTimersByTimeAsync(2_100))
    await vi.waitFor(() => expect(onReceived).toHaveBeenCalledOnce())
    expect(store).toHaveBeenCalledWith(accountId, expect.any(Uint8Array))
    expect(result.current.state.step).toBe('received')
  })

  it('refuses an envelope delivered for another account and stores nothing', async () => {
    const onReceived = vi.fn()
    const { result } = renderHook(() => useReceiveSecretKey(accountId, onReceived))
    await vi.waitFor(() => expect(result.current.state.step).toBe('waiting'))
    const other = '22222222-2222-4222-8222-222222222222'
    const envelope = await sealFor(relayedKey, other)
    api.claim.mockResolvedValueOnce({ status: 'delivered', accountId: other, ...envelope })
    await act(() => vi.advanceTimersByTimeAsync(2_100))
    await vi.waitFor(() => expect(result.current.state.step).toBe('failed'))
    expect(store).not.toHaveBeenCalled()
    expect(onReceived).not.toHaveBeenCalled()
  })

  it('stops at expiry and cancels the session', async () => {
    const { result } = renderHook(() => useReceiveSecretKey(accountId, vi.fn()))
    await vi.waitFor(() => expect(result.current.state.step).toBe('waiting'))
    await act(() => vi.advanceTimersByTimeAsync(302_000))
    expect(result.current.state.step).toBe('expired')
    expect(api.cancel).toHaveBeenCalledWith(transferId, 'poll')
  })

  it('reports a transfer the other device cancelled without storing anything', async () => {
    const onReceived = vi.fn()
    const { result } = renderHook(() => useReceiveSecretKey(accountId, onReceived))
    await vi.waitFor(() => expect(result.current.state.step).toBe('waiting'))
    api.claim.mockResolvedValueOnce({ status: 'unavailable' })
    await act(() => vi.advanceTimersByTimeAsync(2_100))
    expect(result.current.state.step).toBe('unavailable')
    expect(store).not.toHaveBeenCalled()
    expect(onReceived).not.toHaveBeenCalled()
  })
})
