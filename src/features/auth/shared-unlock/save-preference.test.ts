import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedUnlockApiError } from './api'
import { SharedUnlockPreferenceGate } from './preference-gate'
import { saveSharedUnlockPreference } from './save-preference'

const session = { apiUrl: 'https://api.test', userId: '11111111-1111-4111-8111-111111111111', accessToken: 'synthetic-access', sessionId: 'synthetic-refresh' }
const scope = { apiUrl: session.apiUrl, accountId: session.userId }
function setup() {
  const values: Record<string, unknown> = {}
  const storage = { get: async () => structuredClone(values), set: vi.fn(async (next: Record<string, unknown>) => { Object.assign(values, next) }) }
  const gate = new SharedUnlockPreferenceGate(storage), abort = new AbortController()
  const api = { setPreference: vi.fn(async () => ({ sharedUnlockEnabled: false, revision: 4 })) }
  const input = { session, enabled: false, revision: 3, signal: abort.signal, assertCurrent: vi.fn(), accept: vi.fn() }
  return { values, storage, gate, api, input, abort, save: () => saveSharedUnlockPreference(input, api, gate) }
}
afterEach(() => vi.useRealTimers())
describe('saving the one account preference', () => {
  it.each([false, true])('settles a confirmed %s without leaving an independent local choice', async enabled => {
    const f = setup(); f.input.enabled = enabled; f.api.setPreference.mockResolvedValue({ sharedUnlockEnabled: enabled, revision: 4 })
    await f.gate.isAllowed(scope)
    const changed = vi.fn(); f.gate.subscribe(changed)
    const saving = f.save()
    expect(() => f.gate.assertAllowed(scope)).toThrow()
    expect(changed).toHaveBeenCalledOnce()
    await saving
    expect(f.api.setPreference).toHaveBeenCalledExactlyOnceWith(session, enabled, 3, expect.any(AbortSignal))
    expect(f.input.accept).toHaveBeenCalledExactlyOnceWith({ sharedUnlockEnabled: enabled, revision: 4 })
    expect(await new SharedUnlockPreferenceGate(f.storage).isAllowed(scope)).toBe(true)
    expect(JSON.stringify(f.values)).not.toMatch(/synthetic|Enabled|revision/)
  })
  it.each(['network', 'conflict'] as const)('retains denial across restart after %s, without automatic mutation retry', async code => {
    const f = setup(); f.api.setPreference.mockRejectedValue(new SharedUnlockApiError(code))
    await expect(f.save()).rejects.toMatchObject({ code })
    expect(f.api.setPreference).toHaveBeenCalledOnce(); expect(f.input.accept).not.toHaveBeenCalled()
    expect(await new SharedUnlockPreferenceGate(f.storage).isAllowed(scope)).toBe(false)
  })
  it('does not send the API mutation after a failed local pause write', async () => {
    const f = setup(); f.storage.set.mockRejectedValue(new Error('disk'))
    await expect(f.save()).rejects.toThrow()
    expect(f.api.setPreference).not.toHaveBeenCalled(); expect(await f.gate.isAllowed(scope)).toBe(false)
  })
  it('rejects a late successful response after own logout and preserves the pause', async () => {
    const f = setup(); let finish!: () => void
    f.api.setPreference.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ sharedUnlockEnabled: true, revision: 4 }) }))
    const saved = f.save(), rejected = expect(saved).rejects.toThrow()
    await vi.waitFor(() => expect(finish).toBeDefined()); f.abort.abort(); finish(); await rejected
    expect(f.input.accept).not.toHaveBeenCalled(); expect(await f.gate.isAllowed(scope)).toBe(false)
  })
  it('bounds an uncooperative request and does not accept its late result', async () => {
    vi.useFakeTimers()
    const f = setup(); let finish!: () => void
    f.api.setPreference.mockImplementation(() => new Promise(resolve => { finish = () => resolve({ sharedUnlockEnabled: true, revision: 4 }) }))
    const saved = f.save(), rejected = expect(saved).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_000); await rejected; finish(); await Promise.resolve()
    expect(f.input.accept).not.toHaveBeenCalled(); expect(await f.gate.isAllowed(scope)).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not clear a newer local OFF when an older save succeeds', async () => {
    const f = setup(); f.api.setPreference.mockImplementation(async () => {
      await f.gate.pause(scope).persisted
      return { sharedUnlockEnabled: true, revision: 4 }
    })
    await expect(f.save()).rejects.toThrow()
    expect(await f.gate.isAllowed(scope)).toBe(false)
  })
})
