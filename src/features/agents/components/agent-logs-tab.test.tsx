import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import type { AuditLogItem } from '../../audit'
import { useAuditAgentNames } from '../../audit/use-audit-agent-names'
import { useOrgAuditLogs } from '../../audit/use-org-audit-logs'
import { useOrgAuditResourceNames } from '../../audit/use-org-audit-resource-names'
import { useAuthStore } from '../../auth'
import { AgentLogsTab } from './agent-logs-tab'

vi.mock('../../audit/use-audit-agent-names')
vi.mock('../../audit/use-org-audit-logs')
vi.mock('../../audit/use-org-audit-resource-names')
vi.mock('../../auth', () => ({ useAuthStore: vi.fn() }))

const mockLogs = vi.mocked(useOrgAuditLogs)
const mockAgentNames = vi.mocked(useAuditAgentNames)
const mockResourceNames = vi.mocked(useOrgAuditResourceNames)
const mockAuthStore = vi.mocked(useAuthStore)

function row(overrides: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: 'log-1',
    eventType: 'credential.accessed',
    actorType: 'agent',
    userId: null,
    agentId: 'agent-1',
    vaultId: 'vault-1',
    entryId: 'entry-1',
    metadata: {},
    createdAt: '2026-08-13T10:00:00Z',
    ...overrides,
  }
}

function logsReturn(items: AuditLogItem[], overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    ...overrides,
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
    memberNameById: { 'user-1': 'Patryk' },
    resolveAgentName: (id: string) => (id === 'agent-1' ? 'Deploy Bot' : id),
    resolveActorName: (item: AuditLogItem) => item.actorType === 'agent'
      ? 'Deploy Bot'
      : item.userId === 'user-1' ? 'Patryk' : undefined,
    agentOptions: [{ value: 'agent-1', label: 'Deploy Bot' }],
    userOptions: [{ value: 'user-1', label: 'Patryk' }],
  })
  mockResourceNames.mockReturnValue({
    entryNameById: {
      'entry-1': 'Stripe API Key',
      'entry-2': 'GitHub Token',
    },
    vaultNameById: { 'vault-1': 'Production' },
    vaultOptions: [{ value: 'vault-1', label: 'Production' }],
    resolveEntryName: (id: string) => ({
      'entry-1': 'Stripe API Key',
      'entry-2': 'GitHub Token',
    })[id] ?? id,
    resolveVaultName: (id: string) => (id === 'vault-1' ? 'Production' : id),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AgentLogsTab', () => {
  it('renders the canonical audit row and useful filters for the selected agent', () => {
    mockLogs.mockReturnValue(logsReturn([
      row(),
      row({ id: 'off-scope', agentId: 'agent-2', entryId: 'entry-2' }),
    ]))

    render(<AgentLogsTab agentId="agent-1" />)

    const sentence = (_: string, element: Element | null) =>
      element?.tagName === 'P' && /Deploy Bot accessed Stripe API Key/i.test(element.textContent ?? '')
    expect(screen.getByText(sentence)).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    expect(screen.queryByText('GitHub Token')).not.toBeInTheDocument()
    expect(mockLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ agentId: 'agent-1' }),
      true,
    )

    fireEvent.click(screen.getByLabelText('Filters'))
    expect(screen.getByLabelText('Filter by event type')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by user')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by vault')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by agent')).not.toBeInTheDocument()
  })

  it('searches locally resolved entry names and never sends search text to the API', () => {
    mockLogs.mockReturnValue(logsReturn([
      row(),
      row({ id: 'log-2', entryId: 'entry-2' }),
    ]))

    render(<AgentLogsTab agentId="agent-1" />)
    fireEvent.change(screen.getByPlaceholderText('Search logs…'), {
      target: { value: 'stripe' },
    })

    expect(screen.getAllByText('Stripe API Key')).toHaveLength(2)
    expect(screen.queryByText('GitHub Token')).not.toBeInTheDocument()
    expect(mockLogs).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ search: expect.anything() }),
      true,
    )
  })

  it('keeps the filter bar visible while the audit page is loading', () => {
    mockLogs.mockReturnValue(logsReturn([], { isPending: true, data: undefined }))

    render(<AgentLogsTab agentId="agent-1" />)

    expect(screen.getByPlaceholderText('Search logs…')).toBeInTheDocument()
    expect(screen.queryByText(/Deploy Bot accessed/i)).not.toBeInTheDocument()
  })

  it('shows the canonical permission state without issuing an enabled query', () => {
    setPermissions(0)
    mockLogs.mockReturnValue(logsReturn([]))

    render(<AgentLogsTab agentId="agent-1" />)

    expect(screen.getByText("You don't have permission to view audit logs.")).toBeInTheDocument()
    expect(mockLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ agentId: 'agent-1' }),
      false,
    )
  })

  it('automatically loads the next cursor page when the sentinel enters view', async () => {
    const fetchNextPage = vi.fn()
    mockLogs.mockReturnValue(logsReturn([row()], {
      hasNextPage: true,
      fetchNextPage,
    }))
    vi.stubGlobal('IntersectionObserver', class {
      private readonly callback: IntersectionObserverCallback

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }

      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      }

      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      readonly root = null
      readonly rootMargin = '0px'
      readonly thresholds = [0]
    })

    render(<AgentLogsTab agentId="agent-1" />)

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1))
  })
})
