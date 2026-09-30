import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '../../shared/lib/i18n'
import { useAuditAgentNames } from './use-audit-agent-names'
import type { AuditLogItem } from './api/audit-api'

const directory = vi.hoisted(() => vi.fn(() => ({ nameById: { sender: 'Sender', member: 'Member' } })))
vi.mock('../../shared/hooks/use-organization-member-directory', () => ({ useOrganizationMemberDirectory: directory }))
vi.mock('../agents', () => ({ useAgentNames: () => ({ data: [] }) }))
vi.mock('../auth', () => ({ useAuthStore: (selector: (state: { accessToken: null }) => unknown) => selector({ accessToken: null }) }))
beforeEach(async () => { vi.clearAllMocks(); await i18n.changeLanguage('en') })
afterEach(cleanup)

it('does not resolve or filter an external recipient as a Member, even if an unrelated user ID is present', () => {
  const external: AuditLogItem = { id: 'external', eventType: 'entry-share.confirmed', actorType: 'externalRecipient',
    userId: 'sender', metadata: {}, createdAt: '2026-09-20T12:00:00Z' }
  const member = { ...external, id: 'human', actorType: 'user', userId: 'member' }
  const { result } = renderHook(() => useAuditAgentNames([external, member]))
  expect(directory).toHaveBeenCalledWith(null, ['member'], true)
  expect(result.current.resolveActorName(external)).toBe('External recipient')
  expect(result.current.resolveActorName(member)).toBe('Member')
  expect(result.current.userOptions).toEqual([{ value: 'member', label: 'Member' }])
})
