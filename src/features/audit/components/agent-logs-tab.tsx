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

export interface AgentLogsTabProps {
  agentId: string
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

/** Keep Agent scope server-side while presentation/search use authorized local labels. */
export function AgentLogsTab({ agentId }: AgentLogsTabProps) {
  const { t } = useTranslation()
  const permissions = useAuthStore((state) => state.permissions)
  const canView = (permissions & PERMISSION_AUDIT_VIEW) !== 0
  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER)

  const logs = useOrgAuditLogs(
    {
      agentId,
      eventType: csvParam(filter.eventType),
      userId: csvParam(filter.userId),
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
  const presentation = useAuditLogPresentation(allItems, { enabled: canView })
  const {
    userOptions,
    agentNameById,
    memberNameById,
    entryNameById,
    vaultNameById,
    vaultOptions,
  } = presentation

  const filtered = useMemo(
    () => filterAuditLogs(allItems, {
      agentId,
      search: filter.search,
      agentNameById,
      memberNameById,
      entryNameById,
      vaultNameById,
    }),
    [
      allItems,
      agentId,
      filter.search,
      agentNameById,
      memberNameById,
      entryNameById,
      vaultNameById,
    ],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <AuditFilterBar
          value={filter}
          onChange={setFilter}
          userOptions={userOptions}
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
          emptyMessage={t('audit.emptyLog')}
          canView={canView}
          allowDenormalizedNames={false}
        />
      </ScrollArea>
    </div>
  )
}
