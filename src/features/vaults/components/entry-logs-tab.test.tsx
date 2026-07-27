import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import { EntryLogsTab } from './entry-logs-tab'

const mocks = vi.hoisted(() => ({
  useLogs: vi.fn(),
  agents: vi.fn(),
  members: vi.fn(),
}))

vi.mock('../../agents', () => ({ useAgentNames: () => mocks.agents() }))
vi.mock('../use-vault-members', () => ({ useVaultMembers: () => mocks.members() }))
vi.mock('../../audit', () => ({
  ENTRY_RELEVANT_EVENT_TYPES: ['entry.updated', 'credential.accessed'],
  useVaultAuditLogs: (...args: unknown[]) => mocks.useLogs(...args),
  filterAuditLogs: (items: Array<{ entryId?: string }>, filter: { entryId?: string }) =>
    items.filter((item) => !filter.entryId || item.entryId === filter.entryId),
  AuditFilterBar: ({ onChange }: { onChange: (value: unknown) => void }) => (
    <button type="button" onClick={() => onChange({
      search: 'local only', eventType: ['entry.updated'], agentId: ['agent-1'],
      userId: [], vaultId: [], from: '2026-07-01', to: '2026-07-31',
    })}>Apply filters</button>
  ),
  AuditLogList: (props: {
    items: Array<{ id: string; agentId?: string; actorType: string; userId?: string; entryId?: string }>
    resolveAgentName: (id: string) => string
    resolveActorName: (item: never) => string | undefined
    resolveEntryName: (id: string) => string
  }) => (
    <div>
      {props.items.map((item) => (
        <div key={item.id}>
          <span>{item.agentId ? props.resolveAgentName(item.agentId) : ''}</span>
          <span>{props.resolveActorName(item as never)}</span>
          <span>{item.entryId ? props.resolveEntryName(item.entryId) : ''}</span>
        </div>
      ))}
    </div>
  ),
}))

const rows = [
  { id: 'a', eventType: 'credential.accessed', actorType: 'agent', agentId: 'agent-1',
    agentName: 'SERVER NAME', entryId: 'entry-1', metadata: {}, createdAt: '2026-07-26T10:00:00Z' },
  { id: 'b', eventType: 'entry.updated', actorType: 'user', userId: '00112233-4455-4677-8899-aabbccddeeff',
    actorName: 'SERVER ACTOR', entryId: 'entry-1', metadata: {}, createdAt: '2026-07-26T09:00:00Z' },
  { id: 'c', eventType: 'entry.updated', actorType: 'user', userId: '99992233-4455-4677-8899-aabbccddeeff',
    entryId: 'entry-1', metadata: {}, createdAt: '2026-07-26T08:00:00Z' },
]

describe('EntryLogsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ permissions: PERMISSION_AUDIT_VIEW })
    mocks.agents.mockReturnValue({ data: [{ agentId: 'agent-1', name: 'Local Agent' }] })
    mocks.members.mockReturnValue({ data: { pages: [{ items: [{
      memberId: '00112233-4455-4677-8899-aabbccddeeff', memberName: 'Local Member',
    }] }] } })
    mocks.useLogs.mockReturnValue({ data: { pages: [{ items: rows }] }, isPending: false, isError: false,
      refetch: vi.fn(), hasNextPage: false, isFetchingNextPage: false,
      isFetchNextPageError: false, fetchNextPage: vi.fn() })
  })

  it('queries the composite opaque scope and resolves names locally with an opaque fallback', () => {
    render(<EntryLogsTab vaultId="vault-1" entryId="entry-1" entryName="Local Entry" />)
    expect(mocks.useLogs).toHaveBeenCalledWith('vault-1', { entryId: 'entry-1' }, true)
    expect(screen.getAllByText('Local Agent')).toHaveLength(2)
    expect(screen.getByText('Local Member')).toBeInTheDocument()
    expect(screen.getByText('99992233…ddeeff')).toBeInTheDocument()
    expect(screen.getAllByText('Local Entry')).toHaveLength(3)
    expect(screen.queryByText('SERVER NAME')).not.toBeInTheDocument()
    expect(screen.queryByText('SERVER ACTOR')).not.toBeInTheDocument()
  })

  it('sends structured filters but keeps free-text search local', async () => {
    const user = userEvent.setup()
    render(<EntryLogsTab vaultId="vault-1" entryId="entry-1" entryName="Local Entry" />)
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(mocks.useLogs).toHaveBeenLastCalledWith('vault-1', {
      entryId: 'entry-1', agentId: 'agent-1', actions: 'entry.updated',
      from: '2026-07-01', to: '2026-07-31',
    }, true))
    expect(mocks.useLogs.mock.calls.at(-1)?.[1]).not.toHaveProperty('search')
  })
})
