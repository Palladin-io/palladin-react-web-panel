import 'fake-indexeddb/auto'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({ synchronize: vi.fn(async () => {}) }))

vi.mock('./member-sync-engine', () => ({
  MemberSyncEngine: class {
    synchronize = probe.synchronize
  },
}))
vi.mock('./member-sync-cache', () => ({ IndexedDbMemberSyncCache: class {} }))
vi.mock('../../auth', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    accessToken: 'token',
    userId: '11111111-1111-4111-8111-111111111111',
    privateKey: new Uint8Array(32),
    isVaultLocked: false,
  }),
}))

import { MemberSyncProvider } from './member-sync-provider'

describe('MemberSyncProvider refresh lifecycle', () => {
  beforeEach(() => {
    probe.synchronize.mockClear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('polls a visible online tab without overlapping an in-flight synchronization', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    render(<MemberSyncProvider><span>child</span></MemberSyncProvider>)
    await act(async () => { await Promise.resolve() })
    expect(probe.synchronize).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(probe.synchronize).toHaveBeenCalledTimes(2)
  })
})
