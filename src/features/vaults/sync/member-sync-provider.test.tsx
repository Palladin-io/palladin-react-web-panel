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

import { MemberSyncProvider } from './member-sync-provider'
import { useMemberSyncStore } from './member-sync-store'

describe('MemberSyncProvider refresh lifecycle', () => {
  beforeEach(() => {
    probe.synchronize.mockClear()
    useMemberSyncStore.getState().clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('polls a visible online tab without overlapping an in-flight synchronization', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    render(
      <MemberSyncProvider
        enabled
        userId="11111111-1111-4111-8111-111111111111"
        memberPrivateKey={new Uint8Array(32)}
      >
        <span>child</span>
      </MemberSyncProvider>,
    )
    await act(async () => { await Promise.resolve() })
    expect(probe.synchronize).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(probe.synchronize).toHaveBeenCalledTimes(2)
  })

  it('removes decrypted vault metadata when the provider locks', async () => {
    useMemberSyncStore.getState().publishVault({
      vaultId: '22222222-2222-4222-8222-222222222222',
      metadata: { name: 'Private vault' },
      structure: {
        isDefault: false,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-02T00:00:00Z',
        memberCount: 1,
        entryCount: 0,
        activeGrantCount: 0,
      },
      entries: new Map(),
      appliedThroughSequence: '1',
      status: 'ready',
      failureKind: null,
    })
    const view = render(
      <MemberSyncProvider
        enabled
        userId="11111111-1111-4111-8111-111111111111"
        memberPrivateKey={new Uint8Array(32)}
      >
        <span>child</span>
      </MemberSyncProvider>,
    )
    await act(async () => { await Promise.resolve() })

    view.rerender(
      <MemberSyncProvider enabled={false} userId={null} memberPrivateKey={null}>
        <span>child</span>
      </MemberSyncProvider>,
    )

    expect(useMemberSyncStore.getState().vaults.size).toBe(0)
    expect(useMemberSyncStore.getState().status).toBe('idle')
  })

  it('retries immediately without cycling the provider lifecycle', async () => {
    render(
      <MemberSyncProvider
        enabled
        userId="11111111-1111-4111-8111-111111111111"
        memberPrivateKey={new Uint8Array(32)}
      >
        <span>child</span>
      </MemberSyncProvider>,
    )
    await act(async () => { await Promise.resolve() })

    act(() => useMemberSyncStore.getState().retry())
    await act(async () => { await Promise.resolve() })

    expect(probe.synchronize).toHaveBeenCalledTimes(2)
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
  })
})
