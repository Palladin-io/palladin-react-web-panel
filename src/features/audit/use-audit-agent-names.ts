import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { shortenKey } from '../../shared/lib/shorten-key'
import { useAgentNames } from '../agents'
import { useTeamMembers } from '../teams/use-team-members'
import type { AuditLogItem } from './api/audit-api'
import type { AuditFilterOption } from './components/audit-filter-bar'

export interface AuditAgentNames {
  /** id → display name from the authorized Agent cache only. */
  agentNameById: Record<string, string>
  /** Resolve an id to a name, falling back to a shortened id (never a misleading "unknown"). */
  resolveAgentName: (agentId: string) => string
  /** Distinct agents present in `items`, as filter-dropdown options. */
  agentOptions: AuditFilterOption[]
  /** id → display name from the authorized organization Member cache only. */
  memberNameById: Record<string, string>
  /** Resolve a human/system actor without trusting the audit row. */
  resolveActorName: (item: AuditLogItem) => string | undefined
  /** Distinct human actors present in `items`, labelled locally. */
  userOptions: AuditFilterOption[]
}

/**
 * Resolves principals from authorized structural caches. Audit-row names are
 * deliberately ignored; deleted/unresolved ids use prefix+suffix shortening.
 */
export function useAuditAgentNames(
  items: AuditLogItem[],
  enabled = true,
): AuditAgentNames {
  const { t } = useTranslation()
  const agents = useAgentNames(enabled)
  const members = useTeamMembers(enabled)

  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents.data ?? []) {
      if (a.name) map[a.agentId] = a.name
    }
    return map
  }, [agents.data])

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const member of members.data ?? []) {
      if (member.displayName.trim()) map[member.userId] = member.displayName.trim()
    }
    return map
  }, [members.data])

  const resolveAgentName = useCallback(
    (id: string) => agentNameById[id] ?? shortenKey(id),
    [agentNameById],
  )

  const agentOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items) {
      if (item.agentId) ids.add(item.agentId)
    }
    return [...ids].map((id) => ({
      value: id,
      label: agentNameById[id] ?? shortenKey(id),
    }))
  }, [items, agentNameById])

  const userOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items) {
      if (item.userId) ids.add(item.userId)
    }
    return [...ids].map((value) => ({
      value,
      label: memberNameById[value] ?? shortenKey(value),
    }))
  }, [items, memberNameById])

  const resolveActorName = useCallback((item: AuditLogItem) => {
    if (item.actorType === 'system') return t('audit.systemActor')
    if (item.actorType === 'agent') {
      return item.agentId ? agentNameById[item.agentId] ?? shortenKey(item.agentId) : undefined
    }
    return item.userId ? memberNameById[item.userId] ?? shortenKey(item.userId) : undefined
  }, [agentNameById, memberNameById, t])

  return {
    agentNameById,
    memberNameById,
    resolveAgentName,
    resolveActorName,
    agentOptions,
    userOptions,
  }
}
