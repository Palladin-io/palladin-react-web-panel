import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import {
  AuditFilterBar,
  type AuditFilterState,
  AuditLogList,
  ENTRY_RELEVANT_EVENT_TYPES,
  filterAuditLogs,
  useAuditLogPresentation,
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
  const entryNameById = useMemo(() => ({ [entryId]: entryName }), [entryId, entryName])
  const presentation = useAuditLogPresentation(allItems, {
    enabled: canView,
    entryNameById,
  })
  const { agentNameById, memberNameById, agentOptions } = presentation

  const filtered = useMemo(
    () =>
      filterAuditLogs(allItems, {
        entryId,
        // Structured filters are already server-side so pagination represents
        // the requested result set. Keep EntryId locally as defense-in-depth;
        // free-text remains local and never reaches the API.
        search: filter.search,
        agentNameById,
        memberNameById,
        entryNameById,
      }),
    [allItems, entryId, filter.search, agentNameById, memberNameById, entryNameById],
  )

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
        presentation={presentation}
        showEntry={false}
        emptyMessage={t('audit.emptyLog')}
        canView={canView}
        allowDenormalizedNames={false}
      />
    </div>
  )
}
