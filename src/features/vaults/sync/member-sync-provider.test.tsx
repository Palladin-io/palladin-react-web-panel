import 'fake-indexeddb/auto'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({
  synchronize: vi.fn(async () => {}),
  createDefaultVault: vi.fn(async () => 'created'),
  reconcileDiscovery: vi.fn(async () => {}),
}))

vi.mock('./member-sync-engine', () => ({
  MemberSyncEngine: class {
    synchronize = probe.synchronize
  },
}))
vi.mock('./member-sync-cache', () => ({ IndexedDbMemberSyncCache: class {} }))
vi.mock('../../../shared/lib/create-default-vault-safe', () => ({
  createDefaultVaultSafe: probe.createDefaultVault,
}))
vi.mock('./agent-discovery-reconciler', () => ({
  AGENT_DISCOVERY_RECONCILE_EVENT: 'palladin:agent-discovery-reconcile',
  reconcileAgentDiscovery: probe.reconcileDiscovery,
}))

import { MemberSyncProvider } from './member-sync-provider'
import { useMemberSyncStore } from './member-sync-store'

describe('MemberSyncProvider refresh lifecycle', () => {
  beforeEach(() => {
    probe.synchronize.mockClear()
    probe.createDefaultVault.mockClear()
    probe.reconcileDiscovery.mockClear()
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

  it('starts synchronization when an already-mounted provider unlocks', async () => {
    const view = render(
      <MemberSyncProvider enabled={false} userId={null} memberPrivateKey={null}>
        <span>child</span>
      </MemberSyncProvider>,
    )

    expect(probe.synchronize).not.toHaveBeenCalled()

    view.rerender(
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
  })

  it('queues Discovery reconciliation when an Agent is approved during an active pass', async () => {
    let finishFirst!: () => void
    probe.reconcileDiscovery.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishFirst = resolve
    }))

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
    expect(probe.reconcileDiscovery).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event('palladin:agent-discovery-reconcile'))
    })
    expect(probe.reconcileDiscovery).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishFirst()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(probe.reconcileDiscovery).toHaveBeenCalledTimes(2)
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

  it('repairs a missing default Vault only after authoritative sync completes', async () => {
    const privateKey = new Uint8Array(32).fill(9)
    render(
      <MemberSyncProvider
        enabled
        userId="11111111-1111-4111-8111-111111111111"
        memberPrivateKey={privateKey}
      >
        <span>child</span>
      </MemberSyncProvider>,
    )
    await act(async () => { await Promise.resolve() })
    expect(probe.createDefaultVault).not.toHaveBeenCalled()

    await act(async () => {
      useMemberSyncStore.getState().complete()
      await Promise.resolve()
    })

    expect(probe.createDefaultVault).toHaveBeenCalledWith(privateKey, expect.any(String))
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
    expect(probe.synchronize).toHaveBeenCalledTimes(2)
  })

  it('resyncs once without restarting creation when a concurrent creator wins', async () => {
    probe.createDefaultVault.mockResolvedValue('already-exists')
    const privateKey = new Uint8Array(32).fill(9)
    render(
      <MemberSyncProvider
        enabled
        userId="11111111-1111-4111-8111-111111111111"
        memberPrivateKey={privateKey}
      >
        <span>child</span>
      </MemberSyncProvider>,
    )
    await act(async () => { await Promise.resolve() })

    await act(async () => {
      useMemberSyncStore.getState().complete()
      await Promise.resolve()
    })
    expect(probe.createDefaultVault).toHaveBeenCalledTimes(1)
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
    expect(probe.synchronize).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      useMemberSyncStore.getState().complete()
      await Promise.resolve()
    })

    expect(probe.createDefaultVault).toHaveBeenCalledTimes(1)
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
    expect(probe.synchronize).toHaveBeenCalledTimes(3)
  })
})
