import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import { filterAuditLogs } from '../audit-log-filter'
import { csvParam } from '../filter-params'
import { useAuditLogPresentation } from '../use-audit-log-presentation'
import { useOrgAuditLogs } from '../use-org-audit-logs'
import { AuditFilterBar, type AuditFilterState } from './audit-filter-bar'
import { AuditLogList } from './audit-log-list'

const EMPTY_FILTER: AuditFilterState = {
  search: '',
  eventType: [],
  agentId: [],
  userId: [],
  vaultId: [],
  from: '',
  to: '',
}

/** Audit activity performed by one organization member. */
export function MemberLogsTab({ memberId }: { memberId: string }) {
  const { t } = useTranslation()
  const permissions = useAuthStore((state) => state.permissions)
  const canView = (permissions & PERMISSION_AUDIT_VIEW) !== 0
  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER)

  const logs = useOrgAuditLogs(
    {
      userId: memberId,
      agentId: csvParam(filter.agentId),
      eventType: csvParam(filter.eventType),
      vaultId: csvParam(filter.vaultId),
      from: filter.from || undefined,
      to: filter.to || undefined,
    },
    canView,
  )

  const allItems = useMemo(
    () => (logs.data?.pages ?? []).flatMap((page) => page.items),
    [logs.data],
  )
  const scopedItems = useMemo(
    () => allItems.filter((item) => item.userId === memberId),
    [allItems, memberId],
  )
  const presentation = useAuditLogPresentation(scopedItems, { enabled: canView })
  const {
    agentOptions,
    agentNameById,
    memberNameById,
    entryNameById,
    vaultNameById,
    vaultOptions,
  } = presentation

  const filtered = useMemo(
    () => filterAuditLogs(scopedItems, {
      search: filter.search,
      agentId: filter.agentId,
      eventType: filter.eventType,
      from: filter.from || undefined,
      to: filter.to || undefined,
      agentNameById,
      memberNameById,
      entryNameById,
      vaultNameById,
    }),
    [
      scopedItems,
      filter,
      agentNameById,
      memberNameById,
      entryNameById,
      vaultNameById,
    ],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        <AuditFilterBar
          value={filter}
          onChange={setFilter}
          agentOptions={agentOptions}
          vaultOptions={vaultOptions}
        />
      </div>
      <ScrollArea>
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
          showVault
          emptyMessage={t('team.auditEmpty')}
          canView={canView}
          allowDenormalizedNames={false}
        />
      </ScrollArea>
    </div>
  )
}
