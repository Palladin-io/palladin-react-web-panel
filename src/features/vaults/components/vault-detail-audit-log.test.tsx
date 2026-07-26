import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import type { AuditLogItem } from '../../audit'
import { useAuditAgentNames, useVaultAuditLogs } from '../../audit'
import { useAuthStore } from '../../auth'
import { useVaultAuditEntryNames } from '../use-vault-audit-entry-names'
import { VaultDetailAuditLog } from './vault-detail-audit-log'

vi.mock('../../audit', async (importActual) => {
  const actual = await importActual<typeof import('../../audit')>()
  return {
    ...actual,
    useVaultAuditLogs: vi.fn(),
    useAuditAgentNames: vi.fn(),
  }
})
vi.mock('../use-vault-audit-entry-names')
vi.mock('../../auth', () => ({ useAuthStore: vi.fn() }))

const mockLogs = vi.mocked(useVaultAuditLogs)
const mockAgentNames = vi.mocked(useAuditAgentNames)
const mockEntryNames = vi.mocked(useVaultAuditEntryNames)
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

function logsReturn(items: AuditLogItem[], over: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useVaultAuditLogs>
}

function setPermissions(permissions: number) {
  mockAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ permissions }),
  )
}

beforeEach(() => {
  setPermissions(PERMISSION_AUDIT_VIEW)
  mockAgentNames.mockReturnValue({
    agentNameById: { 'agent-1': 'github-copilot' },
    resolveAgentName: (id: string) => (id === 'agent-1' ? 'github-copilot' : id),
    agentOptions: [{ value: 'agent-1', label: 'github-copilot' }],
    userOptions: [],
  })
  mockEntryNames.mockReturnValue({
    entryNameById: { 'entry-1': 'Stripe API Key' },
    resolveEntryName: (id: string) =>
      id === 'entry-1' ? 'Stripe API Key' : 'missing…entry',
  })
})

describe('VaultDetailAuditLog', () => {
  it('renders rows for the vault, showing the entry chip', () => {
    mockLogs.mockReturnValue(logsReturn([row()]))
    render(<VaultDetailAuditLog vaultId="vault-1" />)

    const sentence = (_: string, el: Element | null) =>
      el?.tagName === 'P' && /github-copilot accessed Stripe API Key/i.test(el.textContent ?? '')
    expect(screen.getByText(sentence)).toBeInTheDocument()
    // Entry name appears twice: bold in the sentence + as the entry chip
    // (the vault-wide log shows the chip, unlike the entry-scoped tab).
    expect(screen.getAllByText('Stripe API Key')).toHaveLength(2)
  })

  it('shows a skeleton while loading without removing the filter bar', () => {
    mockLogs.mockReturnValue(logsReturn([], { isPending: true, data: undefined }))
    render(<VaultDetailAuditLog vaultId="vault-1" />)

    expect(screen.getByPlaceholderText('Search logs…')).toBeInTheDocument()
    // No row rendered yet — the legend label ("Credential Accessed") is not a row sentence.
    expect(screen.queryByText(/github-copilot accessed/i)).not.toBeInTheDocument()
  })

  it('renders the empty state when the vault has no activity', () => {
    mockLogs.mockReturnValue(logsReturn([]))
    render(<VaultDetailAuditLog vaultId="vault-1" />)

    expect(screen.getByText('No activity recorded yet')).toBeInTheDocument()
  })

  it('blocks the log for users without the AuditView permission', () => {
    setPermissions(0)
    mockLogs.mockReturnValue(logsReturn([]))
    render(<VaultDetailAuditLog vaultId="vault-1" />)

    expect(
      screen.getByText("You don't have permission to view audit logs."),
    ).toBeInTheDocument()
  })

  it('filters locally resolved entry text without sending plaintext to the API', () => {
    mockLogs.mockReturnValue(logsReturn([
      row(),
      row({ id: 'log-2', entryId: 'entry-2' }),
    ]))
    mockEntryNames.mockReturnValue({
      entryNameById: { 'entry-1': 'Stripe API Key', 'entry-2': 'GitHub Token' },
      resolveEntryName: (id: string) =>
        ({ 'entry-1': 'Stripe API Key', 'entry-2': 'GitHub Token' })[id] ?? id,
    })

    render(<VaultDetailAuditLog vaultId="vault-1" />)
    fireEvent.change(screen.getByPlaceholderText('Search logs…'), {
      target: { value: 'stripe' },
    })

    expect(screen.getAllByText('Stripe API Key')).toHaveLength(2)
    expect(screen.queryByText('GitHub Token')).not.toBeInTheDocument()
    expect(mockLogs).toHaveBeenLastCalledWith(
      'vault-1',
      expect.not.objectContaining({ search: expect.anything() }),
      true,
    )
  })

  it('renders a shortened opaque id when an entry was deleted or purged', () => {
    const missingId = '33333333-3333-4333-8333-333333333333'
    mockLogs.mockReturnValue(logsReturn([row({ entryId: missingId, entryLabel: null })]))
    mockEntryNames.mockReturnValue({
      entryNameById: {},
      resolveEntryName: () => '33333333…333333',
    })

    render(<VaultDetailAuditLog vaultId="vault-1" />)
    expect(screen.getAllByText('33333333…333333')).toHaveLength(2)
  })
})
