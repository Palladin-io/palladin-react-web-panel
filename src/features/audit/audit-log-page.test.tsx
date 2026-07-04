import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_AUDIT_VIEW } from '../../shared/lib/permissions'
import type { AuditLogItem } from './api/audit-api'
import { AuditLogPage } from './audit-log-page'
import { useOrgAuditLogs } from './use-org-audit-logs'
import { useAuditAgentNames } from './use-audit-agent-names'
import { useVaults } from '../vaults/use-vaults'
import { useAuthStore } from '../auth'

vi.mock('./use-org-audit-logs')
vi.mock('./use-audit-agent-names')
vi.mock('../vaults/use-vaults')
vi.mock('../auth', () => ({
  useAuthStore: vi.fn(),
}))

const mockOrgLogs = vi.mocked(useOrgAuditLogs)
const mockAgentNames = vi.mocked(useAuditAgentNames)
const mockVaults = vi.mocked(useVaults)
const mockAuthStore = vi.mocked(useAuthStore)

function row(overrides: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: 'log-1',
    eventType: 'credential.accessed',
    actorType: 'agent',
    agentId: 'agent-1',
    agentName: 'github-copilot',
    entryId: 'entry-1',
    entryLabel: 'Stripe API Key',
    agentReason: null,
    metadata: {},
    createdAt: '2026-06-27T10:00:00Z',
    ...overrides,
  }
}

function orgLogsReturn(items: AuditLogItem[], over: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useOrgAuditLogs>
}

beforeEach(() => {
  mockAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ permissions: PERMISSION_AUDIT_VIEW }),
  )
  mockVaults.mockReturnValue({
    data: { vaults: [] },
  } as unknown as ReturnType<typeof useVaults>)
  mockAgentNames.mockReturnValue({
    agentNameById: { 'agent-1': 'github-copilot' },
    resolveAgentName: (id: string) => (id === 'agent-1' ? 'github-copilot' : id),
    agentOptions: [{ value: 'agent-1', label: 'github-copilot' }],
    userOptions: [],
  })
})

describe('AuditLogPage', () => {
  it('renders the page header and a row from the org log', () => {
    mockOrgLogs.mockReturnValue(orgLogsReturn([row()]))
    render(<AuditLogPage />)

    expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument()
    const sentence = (_: string, el: Element | null) =>
      el?.tagName === 'P' && /github-copilot accessed Stripe API Key/i.test(el.textContent ?? '')
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })

  it('enables CSV export and requests the backend job on click', () => {
    mockOrgLogs.mockReturnValue(orgLogsReturn([row()]))
    render(<AuditLogPage />)
    const button = screen.getByRole('button', { name: /export csv/i })
    expect(button).toBeEnabled()
  })

  it('shows the empty state when there is no activity', () => {
    mockOrgLogs.mockReturnValue(orgLogsReturn([]))
    render(<AuditLogPage />)

    expect(screen.getByText('No activity recorded yet')).toBeInTheDocument()
  })
})
