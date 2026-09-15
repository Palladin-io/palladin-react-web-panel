import { describe, expect, it, vi } from 'vitest'
import { SharedUnlockPreferenceGate } from './preference-gate'
import { SharedUnlockLinkStore } from './link-store'
import { SharedUnlockExpiryStore } from './expiry-store'

const scope = { apiUrl: 'https://api.example.test', webOrigin: 'https://web.example.test',
  extensionId: 'test-extension', accountId: '11111111-1111-4111-8111-111111111111' }
const linkId = '22222222-2222-4222-8222-222222222222'
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }

function fixture() {
  const values: Record<string, unknown> = {}
  const storage = { get: vi.fn(async () => structuredClone(values)),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(values, structuredClone(items)) }) }
  const held = new Set<string>()
  const lock = (name: string) => {
    let tail = Promise.resolve()
    return <T,>(action: () => Promise<T>): Promise<T> => {
      const result = tail.then(async () => {
        held.add(name)
        try { return await action() } finally { held.delete(name) }
      })
      tail = result.then(() => {}, () => {})
      return result
    }
  }
  const pauseLock = lock('pause'), linkLock = lock('links'), expiryLock = lock('expiry')
  const make = () => ({ gate: new SharedUnlockPreferenceGate(storage, pauseLock),
    links: new SharedUnlockLinkStore(storage, undefined, linkLock),
    expiry: new SharedUnlockExpiryStore(storage, expiryLock, () => 100) })
  const own = make(), peer = make()
  const publish = (action: (deadline: number) => void) => own.gate.withAllowed(scope, () =>
    own.links.withInstallable(scope, linkId, 2, 5, () =>
      own.expiry.withCheckpoint(scope, 5, 500, 900, deadline => { own.gate.assertAllowed(scope); action(deadline) })))
  return { own, peer, held, publish, storage, pauseLock, expiryLock }
}

describe('origin-wide receiver publication locks', () => {
  it('holds all three locks through synchronous publication and preserves an earlier idle ceiling', async () => {
    const f = fixture()
    await f.own.links.adopt(scope, linkId)
    await f.peer.expiry.checkpoint(scope, 5, 200, 900)
    const published = vi.fn((deadline: number) => {
      expect([...f.held]).toEqual(['pause', 'links', 'expiry'])
      expect(deadline).toBe(200)
    })
    await f.publish(published)
    expect(published).toHaveBeenCalledOnce()
    expect(f.held.size).toBe(0)
  })

  it('rereads a peer pause queued before it acquires the origin lock', async () => {
    const f = fixture(), stall = deferred(), entered = deferred()
    await f.own.links.adopt(scope, linkId)
    const held = f.pauseLock(async () => { entered.resolve(); await stall.promise })
    await entered.promise
    const pause = f.peer.gate.pause(scope)
    const published = vi.fn(), rejected = expect(f.publish(published)).rejects.toThrow('locally paused')
    stall.resolve()
    await held; await pause.persisted; await rejected
    expect(published).not.toHaveBeenCalled()
  })

  it('serializes a peer closing write after publication when publication owns the locks first', async () => {
    const f = fixture(), stall = deferred(), entered = deferred()
    await f.own.links.adopt(scope, linkId)
    const expiryHeld = f.expiryLock(async () => { entered.resolve(); await stall.promise })
    await entered.promise
    const events: string[] = []
    const publication = f.publish(() => { events.push('published') })
    await vi.waitFor(() => expect(f.held.has('links')).toBe(true))
    const closing = f.peer.links.recordManualClosing(scope, 'lock').then(() => { events.push('closed') })
    expect(events).toEqual([])
    stall.resolve()
    await expiryHeld; await publication; await closing
    expect(events).toEqual(['published', 'closed'])
  })

  it('retains synchronous own pause while publication waits for the final lock', async () => {
    const f = fixture(), stall = deferred(), entered = deferred()
    await f.own.links.adopt(scope, linkId)
    const expiryHeld = f.expiryLock(async () => { entered.resolve(); await stall.promise })
    await entered.promise
    const published = vi.fn(), rejected = expect(f.publish(published)).rejects.toThrow('locally paused')
    await vi.waitFor(() => expect(f.held.has('links')).toBe(true))
    const pause = f.own.gate.pause(scope)
    stall.resolve()
    await expiryHeld; await rejected; await pause.persisted
    expect(published).not.toHaveBeenCalled()
  })

  it.each(['pause', 'links', 'expiry'])('does not publish if the %s storage read fails', async boundary => {
    const f = fixture()
    await f.own.links.adopt(scope, linkId)
    const get = f.storage.get.getMockImplementation()!
    f.storage.get.mockImplementation(async () => {
      if ([...f.held].at(-1) === boundary) throw new Error('storage unavailable')
      return get()
    })
    const published = vi.fn()
    await expect(f.publish(published)).rejects.toThrow()
    expect(published).not.toHaveBeenCalled()
    expect(f.held.size).toBe(0)
  })
})
