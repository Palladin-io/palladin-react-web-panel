import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMemberSyncStore, type MemberIndexRecord } from '../vaults/sync/member-sync-store'
import type { AuditLogItem } from './api/audit-api'
import { useVaultAuditEntryNames } from './use-vault-audit-entry-names'

const vaultId = '22222222-2222-4222-8222-222222222222'
const entryId = '33333333-3333-4333-8333-333333333333'
const item = { entryId } as AuditLogItem

beforeEach(() => useMemberSyncStore.getState().clear())

describe('useVaultAuditEntryNames', () => {
  it('resolves labels only from the unlocked in-memory member index', () => {
    const record: MemberIndexRecord = {
      entryId,
      state: 'active',
      currentRevision: '1',
      memberIndexRevision: '1',
      currentKeyVersion: 1,
      payload: { memberLabel: 'Stripe API Key', entryType: 1, searchFields: [] },
      corrupt: false,
    }
    useMemberSyncStore.getState().publishVault({
      vaultId,
      metadata: { name: 'Production' },
      structure: {
        isDefault: false,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
        memberCount: 1,
        entryCount: 1,
        activeGrantCount: 0,
      },
      entries: new Map([[entryId, record]]),
      appliedThroughSequence: '1',
      status: 'ready',
      failureKind: null,
    })

    const { result } = renderHook(() => useVaultAuditEntryNames(vaultId, [item]))
    expect(result.current.resolveEntryName(entryId)).toBe('Stripe API Key')
  })

  it('falls back to a prefix-and-suffix id after purge or lock', () => {
    const { result } = renderHook(() => useVaultAuditEntryNames(vaultId, [item]))
    expect(result.current.resolveEntryName(entryId)).toBe('33333333…333333')

    act(() => useMemberSyncStore.getState().clear())
    expect(result.current.entryNameById).toEqual({})
  })
})
