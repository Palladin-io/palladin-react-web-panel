import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SharedUnlockLinkStore, type StorageArea } from './link-store'

const scope = { apiUrl: 'https://api.test', webOrigin: 'https://web.test', extensionId: 'a'.repeat(32), accountId: '11111111-1111-4111-8111-111111111111' }
const linkId = '22222222-2222-4222-8222-222222222222'
const link = { linkId, revision: 2, epoch: 1, state: 'active' as const, lastInvalidationSequence: 0, lastLogoutSequence: 0 }
let lock: ReturnType<typeof vi.fn>
beforeEach(() => {
  let tail: Promise<unknown> = Promise.resolve()
  lock = vi.fn((_name: string, action: () => Promise<unknown>) => { const next = tail.then(action); tail = next.catch(() => {}); return next })
  vi.stubGlobal('navigator', { locks: { request: lock } })
})
afterEach(() => vi.unstubAllGlobals())
function storage() {
  const values: Record<string, unknown> = {}
  const area: StorageArea = {
    get: async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(values, key)).map(key => [key, structuredClone(values[key])])),
    set: vi.fn(async items => { Object.assign(values, structuredClone(items)) }),
  }
  return { area, values }
}

it('serializes different document instances with the browser origin-wide lock', async () => {
  const f = storage(), first = new SharedUnlockLinkStore(f.area), second = new SharedUnlockLinkStore(f.area)
  await Promise.all([first.adopt(scope, linkId), second.adopt(scope, linkId)])
  expect(lock).toHaveBeenCalledWith('palladin.shared-unlock.links.v1', expect.any(Function))
  expect(f.area.set).toHaveBeenCalledOnce()
  await first.observe(scope, link)
  await Promise.all([first.beginClosing(scope, linkId, 'logout', 2, 1), second.observe(scope, { ...link, revision: 3 })])
  expect((await second.read(scope))?.pending).toEqual([expect.objectContaining({ action: 'logout' })])
  expect((await first.read(scope))?.observed?.revision).toBe(3)
})

it('never treats unavailable cross-document locking as permission to use unsynchronized storage', async () => {
  vi.stubGlobal('navigator', {})
  const f = storage(), store = new SharedUnlockLinkStore(f.area)
  await expect(store.adopt(scope, linkId)).rejects.toThrow('storage lock unavailable')
  expect(f.area.set).not.toHaveBeenCalled()
})

it('preserves disconnect across a reload and newer active server observations', async () => {
  const f = storage(), first = new SharedUnlockLinkStore(f.area)
  await first.adopt(scope, linkId); await first.observe(scope, link)
  const before = await first.beginClosing(scope, linkId, 'disconnect', 2, null)
  const reloaded = new SharedUnlockLinkStore(f.area)
  await reloaded.observe(scope, { ...link, revision: 5 })
  const after = await reloaded.read(scope)
  expect(after?.disconnectId).toBe(before.disconnectId)
  expect(after?.pending).toEqual(before.pending)
  await expect(reloaded.adopt(scope, '33333333-3333-4333-8333-333333333333')).rejects.toThrow()
})

it('retains a failed closing write and refuses the stale active marker until repair', async () => {
  const f = storage(), store = new SharedUnlockLinkStore(f.area)
  await store.adopt(scope, linkId); await store.observe(scope, link)
  vi.mocked(f.area.set).mockRejectedValueOnce(new Error('storage unavailable'))
  await expect(store.beginClosing(scope, linkId, 'logout', 2, 1)).rejects.toThrow()
  await expect(store.read(scope)).rejects.toThrow()
  expect((await store.repair(scope))?.pending[0].action).toBe('logout')
})

it('rejects corrupt bytes rather than replacing an existing link', async () => {
  const f = storage(), store = new SharedUnlockLinkStore(f.area)
  await store.adopt(scope, linkId)
  const key = Object.keys(f.values)[0]; f.values[key] = { broken: true }
  await expect(store.adopt(scope, linkId)).rejects.toThrow()
  expect(f.area.set).toHaveBeenCalledOnce()
})
