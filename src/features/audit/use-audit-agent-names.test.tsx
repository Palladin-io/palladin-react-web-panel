import { cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '../../shared/lib/i18n'
import { useAuditAgentNames } from './use-audit-agent-names'
import type { AuditLogItem } from './api/audit-api'

const directory = vi.hoisted(() => vi.fn(() => ({ nameById: { sender: 'Sender', member: 'Member' } })))
vi.mock('../../shared/hooks/use-organization-member-directory', () => ({ useOrganizationMemberDirectory: directory }))
const agentNames = vi.hoisted(() => ({ current: { data: [] as { agentId: string; name: string }[], isSuccess: true, isFetching: false, refetch: vi.fn() } }))
vi.mock('../agents', () => ({ AGENTS_QUERY_KEY: ['agents'], useAgentNames: () => agentNames.current }))
let queryClient: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
vi.mock('../auth', () => ({ useAuthStore: (selector: (state: { accessToken: null }) => unknown) => selector({ accessToken: null }) }))
beforeEach(async () => {
  vi.clearAllMocks()
  queryClient = new QueryClient()
  queryClient.setQueryData(['agents'], [])
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

it('does not resolve or filter an external recipient as a Member, even if an unrelated user ID is present', () => {
  const external: AuditLogItem = { id: 'external', eventType: 'entry-share.confirmed', actorType: 'externalRecipient',
    userId: 'sender', metadata: {}, createdAt: '2026-09-20T12:00:00Z' }
  const member = { ...external, id: 'human', actorType: 'user', userId: 'member' }
  const { result } = renderHook(() => useAuditAgentNames([external, member]), { wrapper })
  expect(directory).toHaveBeenCalledWith(null, ['member'], true)
  expect(result.current.resolveActorName(external)).toBe('External recipient')
  expect(result.current.resolveActorName(member)).toBe('Member')
  expect(result.current.userOptions).toEqual([{ value: 'member', label: 'Member' }])
})

it('refetches the Agent list once when an audit row references an Agent missing from the cache', () => {
  const refetch = vi.fn()
  agentNames.current = { data: [{ agentId: 'known', name: 'Known agent' }], isSuccess: true, isFetching: false, refetch }
  const expired: AuditLogItem = { id: 'expired', eventType: 'grant.expired', actorType: 'system',
    agentId: 'new-agent', metadata: {}, createdAt: '2026-11-26T10:00:00Z' }
  const { rerender } = renderHook(({ items }) => useAuditAgentNames(items), { initialProps: { items: [expired] }, wrapper })
  expect(refetch).toHaveBeenCalledTimes(1)
  rerender({ items: [expired, { ...expired, id: 'again' }] })
  rerender({ items: [{ ...expired, id: 'known-row', agentId: 'known' }] })
  expect(refetch).toHaveBeenCalledTimes(1)
})

it('shares repair attempts across remounts and surfaces until the Agent cache entry is replaced', () => {
  const refetch = vi.fn()
  agentNames.current = { data: [], isSuccess: true, isFetching: false, refetch }
  const deleted: AuditLogItem = { id: 'gone', eventType: 'grant.expired', actorType: 'system',
    agentId: 'deleted-agent', metadata: {}, createdAt: '2026-11-26T10:00:00Z' }
  renderHook(() => useAuditAgentNames([deleted]), { wrapper }).unmount()
  renderHook(() => useAuditAgentNames([deleted]), { wrapper })
  renderHook(() => useAuditAgentNames([deleted]), { wrapper })
  expect(refetch).toHaveBeenCalledTimes(1)
  queryClient.clear()
  queryClient.setQueryData(['agents'], [])
  renderHook(() => useAuditAgentNames([deleted]), { wrapper })
  expect(refetch).toHaveBeenCalledTimes(2)
})
