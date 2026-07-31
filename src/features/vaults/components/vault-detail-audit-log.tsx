import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import {
  AuditFilterBar,
  AuditLogList,
  csvParam,
  filterAuditLogs,
  useAuditAgentNames,
  useVaultAuditLogs,
  type AuditFilterState,
} from '../../audit'
import { useVaultAuditEntryNames } from '../use-vault-audit-entry-names'

export interface VaultDetailAuditLogProps {
  vaultId: string
}

const EMPTY_FILTER: AuditFilterState = {
  search: '',
  eventType: [],
  agentId: [],
  userId: [],
  vaultId: [],
  from: '',
  to: '',
}

/**
 * Vault Detail · Audit Log tab — the activity trail for one vault.
 * Read-only. Event type, agent and date range are pushed to the server; free
 * text is matched client-side over the loaded pages. Mirrors the Entry Logs tab
 * but spans the whole vault and shows the entry chip on each row. The colour
 * legend lives only on the global /audit screen (a scrollable modal); detail
 * tabs stay focused on the log itself.
 */
export function VaultDetailAuditLog({ vaultId }: VaultDetailAuditLogProps) {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canView = (permissions & PERMISSION_AUDIT_VIEW) !== 0

  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER)

  const logs = useVaultAuditLogs(
    vaultId,
    {
      actions: csvParam(filter.eventType),
      agentId: csvParam(filter.agentId),
      userId: csvParam(filter.userId),
      from: filter.from || undefined,
      to: filter.to || undefined,
    },
    canView,
  )

  const allItems = useMemo(
    () => (logs.data?.pages ?? []).flatMap((p) => p.items),
    [logs.data],
  )

  const {
    resolveAgentName,
    resolveActorName,
    agentOptions,
    userOptions,
    agentNameById,
    memberNameById,
  } =
    useAuditAgentNames(allItems, canView)
  const { resolveEntryName, entryNameById } = useVaultAuditEntryNames(vaultId, allItems)

  const filtered = useMemo(
    () => filterAuditLogs(allItems, {
      search: filter.search,
      agentNameById,
      memberNameById,
      entryNameById,
    }),
    [allItems, filter.search, agentNameById, memberNameById, entryNameById],
  )

  return (
    <div className="min-w-0">
      <AuditFilterBar
        value={filter}
        onChange={setFilter}
        agentOptions={agentOptions}
        userOptions={userOptions}
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
        resolveEntryName={resolveEntryName}
        emptyMessage={t('audit.emptyLog')}
        canView={canView}
      />
    </div>
  )
}
