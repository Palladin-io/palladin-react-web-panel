import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withSharedUnlockPublicationLocks, withSharedUnlockStorageLock, type SharedUnlockStorageLease } from './storage-lock'
import { SharedUnlockLinkStore } from './link-store'
import { SharedUnlockPreferenceGate } from './preference-gate'
import { SharedUnlockExpiryStore } from './expiry-store'

beforeEach(() => {
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('indexedDB', new IDBFactory())
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const scope = { apiUrl: 'http://api.example.test', webOrigin: 'http://panel.example.test',
  extensionId: 'test-extension', accountId: '11111111-1111-4111-8111-111111111111' }
const linkId = '22222222-2222-4222-8222-222222222222'
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }

function fixture() {
  const values: Record<string, unknown> = {}
  const storage = { get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.filter(key => key in values).map(key => [key, structuredClone(values[key])]))),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(values, structuredClone(items)) }) }
  const make = () => ({ gate: new SharedUnlockPreferenceGate(storage, action => withSharedUnlockStorageLock('pause', action)),
    links: new SharedUnlockLinkStore(storage), expiry: new SharedUnlockExpiryStore(storage, undefined, () => 100) })
  const own = make(), peer = make()
  const publish = (action: (deadline: number) => void) => withSharedUnlockPublicationLocks(lease =>
    own.gate.withAllowed(scope, () => own.links.withInstallable(scope, linkId, 2, 5, () =>
      own.expiry.withCheckpoint(scope, 5, 500, 900, deadline => { own.gate.assertAllowed(scope); action(deadline) }, lease), lease), lease))
  return { own, peer, publish, storage, values }
}

describe('HTTP shared-unlock storage transactions', () => {
  it('serializes competing first-use link allocation across independent stores', async () => {
    const f = fixture()
    const [a, b] = await Promise.all([f.own.links.ensure(scope), f.peer.links.ensure(scope)])
    expect(a.linkId).toBe(b.linkId)
    expect(f.storage.set).toHaveBeenCalledOnce()
  })

  it('publishes under all three scopes while retaining the earliest verified deadline', async () => {
    const f = fixture()
    await f.own.links.adopt(scope, linkId)
    await f.peer.expiry.checkpoint(scope, 5, 200, 900)
    const publish = vi.fn()
    await f.publish(publish)
    expect(publish).toHaveBeenCalledExactlyOnceWith(200)
  })

  it.each(['pause', 'closing', 'expiry'] as const)('rejects a previously committed peer %s before publication', async denial => {
    const f = fixture()
    await f.own.links.adopt(scope, linkId)
    if (denial === 'pause') await f.peer.gate.pause(scope).persisted
    if (denial === 'closing') await f.peer.links.recordManualClosing(scope, 'lock')
    if (denial === 'expiry') await f.peer.expiry.advance(scope, 5)
    const publish = vi.fn()
    await expect(f.publish(publish)).rejects.toThrow()
    expect(publish).not.toHaveBeenCalled()
  })

  it('rejects a suspended read, permits a peer denial, and fences the late continuation', async () => {
    const f = fixture(), entered = deferred(), resume = deferred()
    await f.own.links.adopt(scope, linkId)
    const get = f.storage.get.getMockImplementation()!
    f.storage.get.mockImplementationOnce(async keys => {
      const result = await get(keys)
      entered.resolve()
      await resume.promise
      return result
    })
    const publish = vi.fn(), rejected = expect(f.publish(publish)).rejects.toThrow('storage lock unavailable')
    await entered.promise
    await rejected
    await f.peer.gate.pause(scope).persisted
    resume.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(publish).not.toHaveBeenCalled()
    await expect(f.publish(publish)).rejects.toThrow('locally paused')
  })

  it('does not deadlock behind a same-document writer queued after publication acquired all scopes', async () => {
    const f = fixture()
    await f.own.links.adopt(scope, linkId)
    const get = f.storage.get.getMockImplementation()!
    const order: string[] = []
    let closing: Promise<unknown> | undefined
    f.storage.get.mockImplementationOnce(async keys => {
      closing = f.own.links.recordManualClosing(scope, 'lock').then(() => { order.push('closed') })
      return get(keys)
    })
    await f.publish(() => { order.push('published') })
    await closing
    expect(order).toEqual(['published', 'closed'])
    const again = vi.fn()
    await expect(f.publish(again)).rejects.toThrow()
    expect(again).not.toHaveBeenCalled()
  })

  it('cannot reuse a completed transaction lease to bypass the store queue', async () => {
    const f = fixture()
    let captured: SharedUnlockStorageLease | undefined
    await withSharedUnlockPublicationLocks(async lease => { captured = lease })
    expect(captured).toBeDefined()
    expect(() => f.own.gate.withAllowed(scope, async () => {}, captured)).toThrow('storage lock unavailable')
  })

  it('rejects a write after its storage read crossed an event-loop task', async () => {
    const f = fixture(), resume = deferred()
    f.storage.get.mockImplementationOnce(async () => { await resume.promise; return {} })
    const rejected = expect(f.own.links.adopt(scope, linkId)).rejects.toThrow('storage lock unavailable')
    await rejected
    resume.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.storage.set).not.toHaveBeenCalled()
  })

  it('releases failed transactions so later operations can repair', async () => {
    const f = fixture()
    f.storage.set.mockRejectedValueOnce(new Error('write failed'))
    await expect(f.own.links.adopt(scope, linkId)).rejects.toThrow('write failed')
    await f.own.links.repair(scope)
    expect((await f.peer.links.read(scope))?.linkId).toBe(linkId)
  })
})
