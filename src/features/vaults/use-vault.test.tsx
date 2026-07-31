import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useMemberSyncStore } from './sync/member-sync-store'

vi.mock('../../shared/lib/jwt', () => ({ parseJwtPayload: () => ({ org_id: '00112233-4455-4677-8899-aabbccddeeff' }) }))

import { useVault } from './use-vault'

describe('useVault protocol 2 projection', () => {
  afterEach(() => {
    useMemberSyncStore.getState().clear()
    useAuthStore.setState({ accessToken: null, userId: null })
  })

  it('serves decrypted in-memory metadata without calling a plaintext detail API', () => {
    useAuthStore.setState({ accessToken: 'token' })
    act(() => useMemberSyncStore.getState().publishVault({
      vaultId: '11112233-4455-4677-8899-aabbccddeeff',
      metadata: {
        name: 'Production',
        description: 'Local only',
        icon: { kind: 'encryptedAsset', assetId: '22222233-4455-4677-8899-aabbccddeeff' },
        grantMode: 'full',
        color: '#EB4747',
      },
      structure: {
        isDefault: false,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-02T00:00:00Z',
        memberCount: 2,
        entryCount: 3,
        activeGrantCount: 1,
      },
      entries: new Map(),
      appliedThroughSequence: '4',
      status: 'ready',
      failureKind: null,
    }))

    const { result } = renderHook(() => useVault('11112233-4455-4677-8899-aabbccddeeff'))
    expect(result.current.data).toMatchObject({
      name: 'Production',
      description: 'Local only',
      icon: 'vault-asset:22222233-4455-4677-8899-aabbccddeeff',
      entryCount: 3,
    })
    expect(result.current.isError).toBe(false)
  })

  it('keeps a healthy selected vault usable when another vault makes the aggregate sync fail', () => {
    useAuthStore.setState({ accessToken: 'token' })
    act(() => useMemberSyncStore.getState().publishVault({
      vaultId: '11112233-4455-4677-8899-aabbccddeeff',
      metadata: { name: 'Healthy vault' },
      structure: {
        isDefault: false,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-02T00:00:00Z',
        memberCount: 1,
        entryCount: 0,
        activeGrantCount: 0,
      },
      entries: new Map(),
      appliedThroughSequence: '4',
      status: 'ready',
      failureKind: null,
    }))
    act(() => useMemberSyncStore.setState({ status: 'error', error: 'another-vault-failed' }))

    const { result } = renderHook(() => useVault('11112233-4455-4677-8899-aabbccddeeff'))

    expect(result.current.data?.name).toBe('Healthy vault')
    expect(result.current.isError).toBe(false)
  })
})
