import { useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useOrganizationMemberDirectory } from '../../shared/hooks/use-organization-member-directory'
import { organizationIdFromAccessToken } from '../../shared/lib/organization-scope'
import { shortenKey } from '../../shared/lib/shorten-key'
import { AGENTS_QUERY_KEY, useAgentNames } from '../agents'
import { useAuthStore } from '../auth'
import type { AuditLogItem } from './api/audit-api'
import type { AuditFilterOption } from './components/audit-filter-bar'

// Repair attempts live exactly as long as the shared Agent cache entry, so remounts
// and other audit surfaces never refetch again for an ID the same cache already missed.
const repairedAgentIdsByCache = new WeakMap<object, Set<string>>()

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
  const accessToken = useAuthStore((state) => state.accessToken)
  const memberIds = useMemo(
    () => items.flatMap((item) => item.actorType === 'user' && item.userId ? [item.userId] : []),
    [items],
  )
  const members = useOrganizationMemberDirectory(
    organizationIdFromAccessToken(accessToken),
    memberIds,
    enabled,
  )

  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents.data ?? []) {
      if (a.name) map[a.agentId] = a.name
    }
    return map
  }, [agents.data])

  // An Agent enrolled after the cached list was read would otherwise stay an ID.
  const queryClient = useQueryClient()
  const { isSuccess: agentsLoaded, isFetching: agentsFetching, refetch: refetchAgents } = agents
  useEffect(() => {
    if (!enabled || !agentsLoaded || agentsFetching) return
    const cacheEntry = queryClient.getQueryCache().find({ queryKey: AGENTS_QUERY_KEY, exact: true })
    if (!cacheEntry) return
    let repaired = repairedAgentIdsByCache.get(cacheEntry)
    if (!repaired) repairedAgentIdsByCache.set(cacheEntry, (repaired = new Set()))
    const missing = items.flatMap((item) =>
      item.agentId && !agentNameById[item.agentId] && !repaired.has(item.agentId) ? [item.agentId] : [],
    )
    if (missing.length === 0) return
    for (const id of missing) repaired.add(id)
    void refetchAgents()
  }, [enabled, items, agentNameById, agentsLoaded, agentsFetching, queryClient, refetchAgents])

  const memberNameById = useMemo(() => {
    return members.nameById
  }, [members.nameById])

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
      if (item.actorType === 'user' && item.userId) ids.add(item.userId)
    }
    return [...ids].map((value) => ({
      value,
      label: memberNameById[value] ?? shortenKey(value),
    }))
  }, [items, memberNameById])

  const resolveActorName = useCallback((item: AuditLogItem) => {
    if (item.actorType === 'externalRecipient') return t('audit.externalRecipient')
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
