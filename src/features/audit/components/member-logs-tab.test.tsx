import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import type { AuditLogItem } from '../api/audit-api'
import { useAuditAgentNames } from '../use-audit-agent-names'
import { useOrgAuditLogs } from '../use-org-audit-logs'
import { useOrgAuditResourceNames } from '../use-org-audit-resource-names'
import { MemberLogsTab } from './member-logs-tab'

vi.mock('../use-audit-agent-names')
vi.mock('../use-org-audit-logs')
vi.mock('../use-org-audit-resource-names')
vi.mock('../../auth', () => ({ useAuthStore: vi.fn() }))

const mockLogs = vi.mocked(useOrgAuditLogs)
const mockAgentNames = vi.mocked(useAuditAgentNames)
const mockResourceNames = vi.mocked(useOrgAuditResourceNames)
const mockAuthStore = vi.mocked(useAuthStore)

function row(overrides: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: 'log-1',
    eventType: 'credential.accessed',
    actorType: 'user',
    userId: 'member-1',
    agentId: null,
    vaultId: 'vault-1',
    entryId: 'entry-1',
    metadata: {},
    createdAt: '2026-08-18T10:00:00Z',
    ...overrides,
  }
}

function logsReturn(items: AuditLogItem[]) {
  return {
    data: { pages: [{ items, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  } as unknown as ReturnType<typeof useOrgAuditLogs>
}

function setPermissions(permissions: number) {
  mockAuthStore.mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ permissions }),
  )
}

beforeEach(() => {
  setPermissions(PERMISSION_AUDIT_VIEW)
  mockAgentNames.mockReturnValue({
    agentNameById: { 'agent-1': 'Deploy Bot' },
    memberNameById: { 'member-1': 'Patryk', 'member-2': 'Other member' },
    resolveAgentName: (id: string) => id === 'agent-1' ? 'Deploy Bot' : id,
    resolveActorName: (item: AuditLogItem) => item.userId === 'member-1'
      ? 'Patryk'
      : 'Other member',
    agentOptions: [{ value: 'agent-1', label: 'Deploy Bot' }],
    userOptions: [],
  })
  mockResourceNames.mockReturnValue({
    entryNameById: { 'entry-1': 'Stripe API Key', 'entry-2': 'GitHub Token' },
    vaultNameById: { 'vault-1': 'Production' },
    vaultOptions: [{ value: 'vault-1', label: 'Production' }],
    resolveEntryName: (id: string) => id === 'entry-1' ? 'Stripe API Key' : 'GitHub Token',
    resolveVaultName: () => 'Production',
  })
})

describe('MemberLogsTab', () => {
  it('keeps the selected-member boundary on both the request and rendered rows', () => {
    mockLogs.mockReturnValue(logsReturn([
      row(),
      row({ id: 'off-scope', userId: 'member-2', entryId: 'entry-2' }),
    ]))

    render(<MemberLogsTab memberId="member-1" />)

    expect(screen.getAllByText('Stripe API Key')).not.toHaveLength(0)
    expect(screen.queryByText('GitHub Token')).not.toBeInTheDocument()
    expect(mockLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'member-1' }),
      true,
    )

    fireEvent.click(screen.getByLabelText('Filters'))
    expect(screen.getByLabelText('Filter by agent')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by vault')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by user')).not.toBeInTheDocument()
  })

  it('does not enable the audit request without AuditView', () => {
    setPermissions(0)
    mockLogs.mockReturnValue(logsReturn([]))

    render(<MemberLogsTab memberId="member-1" />)

    expect(screen.getByText("You don't have permission to view audit logs.")).toBeInTheDocument()
    expect(mockLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'member-1' }),
      false,
    )
  })
})
