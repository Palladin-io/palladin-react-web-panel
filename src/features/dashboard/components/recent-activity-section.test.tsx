import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditLogItem, AuditLogPresentation } from '../../audit'
import { useAuditLogPresentation } from '../../audit'
import { RecentActivitySection } from './recent-activity-section'

const mocks = vi.hoisted(() => ({
  items: [] as AuditLogItem[],
  presentation: null as AuditLogPresentation | null,
}))

vi.mock('../../auth', () => ({
  useAuthStore: (selector: (state: { permissions: number }) => unknown) =>
    selector({ permissions: Number.MAX_SAFE_INTEGER }),
}))

vi.mock('../../audit', async (importActual) => {
  const actual = await importActual<typeof import('../../audit')>()
  return {
    ...actual,
    useOrgAuditLogs: () => ({
      data: { pages: [{ items: mocks.items }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useAuditLogPresentation: vi.fn(() => mocks.presentation),
    AuditLogList: ({
      items,
      presentation,
    }: {
      items: AuditLogItem[]
      presentation: AuditLogPresentation
    }) => (
      <div>
        {items.map((item) => (
          <span key={item.id}>{presentation.resolveActorName(item)}</span>
        ))}
      </div>
    ),
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/audit">{children}</a>,
}))

const mockPresentationHook = vi.mocked(useAuditLogPresentation)

beforeEach(() => {
  const item: AuditLogItem = {
    id: 'log-1',
    eventType: 'entry.created',
    actorType: 'user',
    userId: '019fd864-0000-4000-8000-00000087482c',
    agentId: null,
    vaultId: 'vault-1',
    entryId: 'entry-1',
    metadata: {},
    createdAt: '2026-08-20T20:41:00Z',
  }
  mocks.items = [item]
  mocks.presentation = {
    agentNameById: {},
    memberNameById: { [item.userId!]: 'patryk@example.com' },
    entryNameById: { 'entry-1': 'OpenClaw Login Test' },
    vaultNameById: { 'vault-1': 'Personal' },
    agentOptions: [],
    userOptions: [{ value: item.userId!, label: 'patryk@example.com' }],
    vaultOptions: [{ value: 'vault-1', label: 'Personal' }],
    resolveAgentName: (id) => id,
    resolveActorName: (row) => row.userId === item.userId ? 'patryk@example.com' : undefined,
    resolveEntryName: (id) => id === 'entry-1' ? 'OpenClaw Login Test' : id,
    resolveVaultName: (id) => id === 'vault-1' ? 'Personal' : id,
  }
  mockPresentationHook.mockClear()
})

describe('RecentActivitySection', () => {
  it('passes the complete shared presentation model so user actors resolve on Home', () => {
    render(<RecentActivitySection />)

    expect(screen.getByText('patryk@example.com')).toBeInTheDocument()
    expect(screen.queryByText(/019fd864/)).not.toBeInTheDocument()
    expect(mockPresentationHook).toHaveBeenCalledWith(mocks.items, { enabled: true })
  })
})
