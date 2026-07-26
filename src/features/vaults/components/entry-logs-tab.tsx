import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { useAgentNames } from '../../agents'
import type { AuditLogItem } from '../../audit'
import {
  AuditFilterBar,
  type AuditFilterState,
  AuditLogList,
  ENTRY_RELEVANT_EVENT_TYPES,
  filterAuditLogs,
  useVaultAuditLogs,
} from '../../audit'
import { useVaultMembers } from '../use-vault-members'

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
  entryName: string
}

/**
 * Entry Detail · Logs tab — the audit trail scoped to one entry. Read-only.
 *
 * The composite opaque VaultId + EntryId scope is filtered server-side so
 * cursor pages contain only relevant events; a repeated local EntryId check is
 * defense-in-depth. Entry, Agent and Member presentation comes only from local
 * unlocked/structural state. Missing or deleted principals use shortened
 * prefix+suffix identifiers instead of trusting denormalized audit-row names.
 */
export function EntryLogsTab({ vaultId, entryId, entryName }: EntryLogsTabProps) {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canView = (permissions & PERMISSION_AUDIT_VIEW) !== 0

  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER)

  const agents = useAgentNames(canView)
  // Actor labels are presentation-only; unlike the Members lifecycle tab they
  // do not need five-second deprovisioning polling.
  const members = useVaultMembers(vaultId, canView, false)
  const serverFilters = useMemo(() => ({
    entryId,
    ...(filter.agentId.length ? { agentId: filter.agentId.join(',') } : {}),
    ...(filter.eventType.length ? { actions: filter.eventType.join(',') } : {}),
    ...(filter.from ? { from: filter.from } : {}),
    ...(filter.to ? { to: filter.to } : {}),
  }), [entryId, filter.agentId, filter.eventType, filter.from, filter.to])
  const logs = useVaultAuditLogs(vaultId, serverFilters, canView)

  const allItems = useMemo(
    () => (logs.data?.pages ?? []).flatMap((p) => p.items),
    [logs.data],
  )

  const agentNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of agents.data ?? []) {
      if (a.name) map[a.agentId] = a.name
    }
    return map
  }, [agents.data])

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const page of members.data?.pages ?? []) {
      for (const member of page.items) {
        if (member.memberName?.trim()) map[member.memberId] = member.memberName.trim()
      }
    }
    return map
  }, [members.data])

  const resolveAgentName = (id: string) => agentNameById[id] ?? shortenKey(id)
  const resolveActorName = (item: AuditLogItem) => {
    if (item.actorType === 'agent') return item.agentId ? resolveAgentName(item.agentId) : undefined
    if (item.actorType === 'system') return t('audit.systemActor')
    return item.userId ? memberNameById[item.userId] ?? shortenKey(item.userId) : undefined
  }

  const filtered = useMemo(
    () =>
      filterAuditLogs(allItems, {
        entryId,
        // Structured filters are already server-side so pagination represents
        // the requested result set. Keep EntryId locally as defense-in-depth;
        // free-text remains local and never reaches the API.
        search: filter.search,
        agentNameById,
        entryNameById: { [entryId]: entryName },
      }),
    [allItems, entryId, entryName, filter.search, agentNameById],
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
        resolveActorName={resolveActorName}
        resolveEntryName={() => entryName}
        showEntry={false}
        emptyMessage={t('audit.emptyLog')}
        canView={canView}
        allowDenormalizedNames={false}
      />
    </div>
  )
}
