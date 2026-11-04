import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTransferKeyPair, openTransferEnvelope, transferSas } from '../../../shared/crypto/device-transfer'
import { toBase64Url } from '../../../shared/crypto/encoding'
import { useAddPhoneTransfer } from './use-add-phone-transfer'

const api = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), deliver: vi.fn(), cancel: vi.fn() }))
const load = vi.hoisted(() => vi.fn())
vi.mock('../api/secret-key-transfer-api', () => ({
  createSenderTransfer: api.create, getSenderTransfer: api.get, deliverSenderTransfer: api.deliver, cancelSenderTransfer: api.cancel,
}))
vi.mock('../../../shared/crypto/secret-key', () => ({ loadDeviceSecretKey: load }))

const accountId = '11111111-1111-4111-8111-111111111111'
const transferId = '44444444-4444-4444-8444-444444444444'
const challenge = toBase64Url(new Uint8Array(32).fill(3))

describe('useAddPhoneTransfer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.create.mockResolvedValue({ transferId, challenge, expiresAt: new Date(Date.now() + 300_000).toISOString() })
    api.deliver.mockResolvedValue(undefined)
    load.mockResolvedValue(new Uint8Array(32).fill(8))
  })
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

  async function untilCompare(recipientPublicKey: Uint8Array) {
    api.get.mockResolvedValue({ challenge, recipientPublicKey: toBase64Url(recipientPublicKey), state: 'bound' })
    const hook = renderHook(() => useAddPhoneTransfer(accountId))
    await vi.waitFor(() => expect(hook.result.current.state.step).toBe('waiting'))
    await act(() => vi.advanceTimersByTimeAsync(2_100))
    await vi.waitFor(() => expect(hook.result.current.state.step).toBe('compare'))
    return hook
  }

  it('shows the code the phone computes and seals only after approval', async () => {
    const phone = await createTransferKeyPair()
    const { result } = await untilCompare(phone.publicKey)
    const state = result.current.state as { sas: string }
    expect(state.sas).toBe(transferSas({ accountId, transferId, challenge, recipientPublicKey: phone.publicKey }))
    expect(api.deliver).not.toHaveBeenCalled()

    await act(() => result.current.approve())
    expect(result.current.state.step).toBe('done')
    const [, envelope] = api.deliver.mock.calls[0]
    const opened = await openTransferEnvelope({ accountId, transferId, challenge }, phone, envelope)
    expect(Array.from(opened)).toEqual(Array.from(new Uint8Array(32).fill(8)))
  })

  it('sends nothing and cancels the session when the user rejects the code', async () => {
    const { result } = await untilCompare((await createTransferKeyPair()).publicKey)
    act(() => result.current.reject())
    expect(result.current.state.step).toBe('rejected')
    expect(api.deliver).not.toHaveBeenCalled()
    expect(api.cancel).toHaveBeenCalledWith(transferId)
    expect(load).not.toHaveBeenCalled()
  })
})
