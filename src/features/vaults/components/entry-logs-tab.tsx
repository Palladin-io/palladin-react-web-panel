import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { useAgentNames } from '../../agents'
import {
  AuditFilterBar,
  type AuditFilterState,
  AuditLogList,
  ENTRY_RELEVANT_EVENT_TYPES,
  filterAuditLogs,
  useVaultAuditLogs,
} from '../../audit'

const EMPTY_FILTER: AuditFilterState = {
  search: '',
  eventType: [],
  agentId: [],
  userId: [],
  vaultId: [],
  from: '',
  to: '',
}

export interface EntryLogsTabProps {
  vaultId: string
  entryId: string
}

/**
 * Entry Detail · Logs tab — the audit trail scoped to one entry. Read-only.
 *
 * The backend has no entry-level audit filter, so this over-fetches the vault
 * log and narrows to this entry client-side (`filterAuditLogs`, with `entryId`
 * acting as a security guard). Agent names are taken from the row when the
 * backend denormalises them (CVT-181); until then they fall back to the agents
 * list (via `useAgentNames`, NOT gated on AgentManage) and finally to a
 * shortened agent id — never a misleading "unknown" for an agent that exists.
 */
export function EntryLogsTab({ vaultId, entryId }: EntryLogsTabProps) {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canView = (permissions & PERMISSION_AUDIT_VIEW) !== 0

  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER)

  const agents = useAgentNames(canView)
  const logs = useVaultAuditLogs(vaultId, {}, canView)

  const allItems = useMemo(
    () => (logs.data?.pages ?? []).flatMap((p) => p.items),
    [logs.data],
  )

  // Prefer the server-denormalised name on the row (CVT-181); fall back to the
  // agents list for everyone who can read it (not just managers).
  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents.data ?? []) {
      if (a.name) map[a.agentId] = a.name
    }
    for (const item of allItems) {
      if (item.agentId && item.agentName) map[item.agentId] = item.agentName
    }
    return map
  }, [agents.data, allItems])

  const resolveAgentName = (id: string) => agentNameById[id] ?? shortenKey(id)

  const filtered = useMemo(
    () =>
      filterAuditLogs(allItems, {
        entryId,
        agentId: filter.agentId,
        eventType: filter.eventType,
        search: filter.search,
        from: filter.from,
        to: filter.to,
        agentNameById,
      }),
    [allItems, entryId, filter, agentNameById],
  )

  // Agents that actually appear in this entry's log — keeps the dropdown short.
  const agentOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const item of allItems) {
      if (item.entryId === entryId && item.agentId) ids.add(item.agentId)
    }
    return [...ids].map((id) => ({ value: id, label: resolveAgentName(id) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, entryId, agentNameById])

  return (
    <div className="min-w-0">
      {/* Same search + collapsible filter control as the vault/global Audit Log —
          restricted to entry-relevant event types; no user/vault filters here. */}
      <AuditFilterBar
        value={filter}
        onChange={setFilter}
        agentOptions={agentOptions}
        eventTypes={ENTRY_RELEVANT_EVENT_TYPES}
      />

      <AuditLogList
        items={filtered}
        isPending={logs.isPending}
        isError={logs.isError}
        onRetry={() => logs.refetch()}
        hasNextPage={logs.hasNextPage}
        isFetchingNextPage={logs.isFetchingNextPage}
        isFetchNextPageError={logs.isFetchNextPageError}
        onLoadMore={() => logs.fetchNextPage()}
        resolveAgentName={resolveAgentName}
        showEntry={false}
        emptyMessage={t('audit.emptyLog')}
        canView={canView}
      />
    </div>
  )
}
