import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMemberSyncStore, type MemberIndexRecord } from '../vaults/sync/member-sync-store'
import { useOrgAuditResourceNames } from './use-org-audit-resource-names'

const vaultId = '22222222-2222-4222-8222-222222222222'
const firstX = '33333333-3333-4333-8333-333333333333'
const secondX = '44444444-4444-4444-8444-444444444444'
const deleted = '55555555-5555-4555-8555-555555555555'
const occurredAt = '2026-11-20T10:00:00Z'

function record(entryId: string, username: string, updatedAt: string): MemberIndexRecord {
  return {
    entryId, state: 'active', updatedAt, currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1,
    payload: { memberLabel: 'X', entryType: 1, username, urlDomain: 'x.com', searchFields: [] },
    corrupt: false,
  }
}

beforeEach(() => {
  useMemberSyncStore.getState().clear()
  useMemberSyncStore.getState().publishVault({
    vaultId,
    metadata: { name: 'Personal' },
    structure: { isDefault: false, createdAt: occurredAt, updatedAt: occurredAt, memberCount: 1, entryCount: 2, activeGrantCount: 0 },
    entries: new Map([
      [firstX, record(firstX, 'synthetic_one', '2026-11-01T00:00:00Z')],
      [secondX, record(secondX, 'synthetic_two', '2026-11-25T00:00:00Z')],
    ]),
    appliedThroughSequence: '1',
    status: 'ready',
    failureKind: null,
  })
})

describe('useOrgAuditResourceNames entry login', () => {
  it('distinguishes same-name Entries by the login of the exact Entry ID', () => {
    const items = [firstX, secondX, deleted].map((entryId) => ({ entryId, vaultId }))
    const { result } = renderHook(() => useOrgAuditResourceNames(items))

    expect(result.current.resolveEntryLogin(firstX, occurredAt)).toEqual({ login: 'synthetic_one', current: false })
    expect(result.current.resolveEntryLogin(secondX, occurredAt)).toEqual({ login: 'synthetic_two', current: true })
    expect(result.current.resolveEntryLogin(deleted, occurredAt)).toBeUndefined()
    expect(result.current.availableEntryIds.has(deleted)).toBe(false)
  })

  it('stops resolving logins after lock clears the member index', () => {
    const { result, rerender } = renderHook(() => useOrgAuditResourceNames([{ entryId: firstX, vaultId }]))
    useMemberSyncStore.getState().clear()
    rerender()
    expect(result.current.resolveEntryLogin(firstX, occurredAt)).toBeUndefined()
    expect(result.current.availableEntryIds.size).toBe(0)
  })
})
