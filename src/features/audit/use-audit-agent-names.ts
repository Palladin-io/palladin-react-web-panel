import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { shortenKey } from '../../shared/lib/shorten-key'
import { useAgentNames } from '../agents'
import type { AuditLogItem } from './api/audit-api'
import type { AuditFilterOption } from './components/audit-filter-bar'

export interface AuditAgentNames {
  /** id → display name, server-denormalised name preferred, agents list as fallback. */
  agentNameById: Record<string, string>
  /** Resolve an id to a name, falling back to a shortened id (never a misleading "unknown"). */
  resolveAgentName: (agentId: string) => string
  /** Distinct agents present in `items`, as filter-dropdown options. */
  agentOptions: AuditFilterOption[]
  /** Distinct human actors (users) present in `items`, as filter-dropdown options.
   *  There is no org users endpoint yet, so options are derived from the rows,
   *  labelled with the server-denormalised `actorName` — never a raw id; when the
   *  name is genuinely unknown the label is a localised "Unknown user". The
   *  option value stays the `userId`. */
  userOptions: AuditFilterOption[]
}

/**
 * Resolves agent ids to display names for an audit view. Prefers the
 * server-denormalised `agentName` on each row (CVT-181), falling back to the
 * agents list (readable by any AuditView holder, not just managers) and finally
 * to a shortened id. The dropdown options are derived from the rows so they list
 * only agents that actually appear in the log.
 */
export function useAuditAgentNames(
  items: AuditLogItem[],
  enabled = true,
): AuditAgentNames {
  const { t } = useTranslation()
  const agents = useAgentNames(enabled)

  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents.data ?? []) {
      if (a.name) map[a.agentId] = a.name
    }
    for (const item of items) {
      if (item.agentId && item.agentName) map[item.agentId] = item.agentName
    }
    return map
  }, [agents.data, items])

  const resolveAgentName = (id: string) => agentNameById[id] ?? shortenKey(id)

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

  const unknownUser = t('audit.unknownUser')
  const userOptions = useMemo(() => {
    const labelById = new Map<string, string>()
    for (const item of items) {
      if (!item.userId) continue
      // Always label by name; upgrade a placeholder once a real name shows up,
      // but never fall back to the raw id.
      const current = labelById.get(item.userId)
      if (current === undefined || current === unknownUser) {
        labelById.set(item.userId, item.actorName ?? unknownUser)
      }
    }
    return [...labelById].map(([value, label]) => ({ value, label }))
  }, [items, unknownUser])

  return { agentNameById, resolveAgentName, agentOptions, userOptions }
}
