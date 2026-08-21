import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditLogItem } from './api/audit-api'
import { useAuditAgentNames } from './use-audit-agent-names'
import { useAuditLogPresentation } from './use-audit-log-presentation'
import { useOrgAuditResourceNames } from './use-org-audit-resource-names'

vi.mock('./use-audit-agent-names')
vi.mock('./use-org-audit-resource-names')

const mockPrincipalNames = vi.mocked(useAuditAgentNames)
const mockResourceNames = vi.mocked(useOrgAuditResourceNames)

const item: AuditLogItem = {
  id: 'log-1',
  eventType: 'entry.created',
  actorType: 'user',
  userId: 'user-1',
  agentId: null,
  vaultId: 'vault-1',
  entryId: 'entry-1',
  metadata: {},
  createdAt: '2026-08-20T20:41:00Z',
}

beforeEach(() => {
  mockPrincipalNames.mockReturnValue({
    agentNameById: { 'agent-1': 'Deploy Bot' },
    memberNameById: { 'user-1': 'Patryk' },
    agentOptions: [{ value: 'agent-1', label: 'Deploy Bot' }],
    userOptions: [{ value: 'user-1', label: 'Patryk' }],
    resolveAgentName: (id) => id === 'agent-1' ? 'Deploy Bot' : id,
    resolveActorName: (row) => row.userId === 'user-1' ? 'Patryk' : undefined,
  })
  mockResourceNames.mockReturnValue({
    entryNameById: { 'entry-1': 'Stale Entry' },
    vaultNameById: { 'vault-1': 'Personal' },
    vaultOptions: [{ value: 'vault-1', label: 'Personal' }],
    resolveEntryName: () => 'Stale Entry',
    resolveVaultName: () => 'Personal',
  })
})

describe('useAuditLogPresentation', () => {
  it('returns one complete model and applies scope-specific decrypted names', () => {
    const { result } = renderHook(() => useAuditLogPresentation([item], {
      enabled: true,
      entryNameById: { 'entry-1': 'Current Entry' },
    }))

    expect(result.current.resolveActorName(item)).toBe('Patryk')
    expect(result.current.resolveEntryName('entry-1')).toBe('Current Entry')
    expect(result.current.resolveVaultName('vault-1')).toBe('Personal')
    expect(result.current.agentOptions).toEqual([{ value: 'agent-1', label: 'Deploy Bot' }])
    expect(mockPrincipalNames).toHaveBeenCalledWith([item], true)
    expect(mockResourceNames).toHaveBeenCalledWith([item])
  })
})
