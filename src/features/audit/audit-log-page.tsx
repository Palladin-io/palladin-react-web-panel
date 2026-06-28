import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { ModalShell } from '../../shared/components/modal-shell'
import { PERMISSION_AUDIT_VIEW } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
// Imported from the module (not the vaults barrel) to avoid an import cycle:
// the vaults barrel pulls in the vault detail page, which renders this feature.
import { useVaults } from '../vaults/use-vaults'
import { filterAuditLogs } from './audit-log-filter'
import { csvParam } from './filter-params'
import { AuditFilterBar, type AuditFilterState } from './components/audit-filter-bar'
import { AuditLogLegend } from './components/audit-log-legend'
import { AuditLogList } from './components/audit-log-list'
import { AUDIT_EVENT_CATEGORIES } from './components/audit-event-config'
import { useAuditAgentNames } from './use-audit-agent-names'
import { useOrgAuditLogs } from './use-org-audit-logs'

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
 * Global Audit Log screen (CVT-65) — org-wide activity history. Left-aligned,
 * full width (no split-view: there is no per-row detail pane; the legend lives
 * in a modal). Event type, agent, vault and date range are pushed to the server;
 * free text matches client-side over the loaded pages.
 *
 * CSV export depends on the backend async-export job (CVT-141), which is not yet
 * available — the button renders disabled with a "coming soon" tooltip rather
 * than faking a download.
 */
export function AuditLogPage() {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canView = (permissions & PERMISSION_AUDIT_VIEW) !== 0

  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER)
  const [legendOpen, setLegendOpen] = useState(false)

  const vaults = useVaults({ enabled: canView })
  const vaultList = vaults.data?.vaults
  const vaultOptions = useMemo(
    () => (vaultList ?? []).map((v) => ({ value: v.id, label: v.name })),
    [vaultList],
  )
  // Reuse the same vault list for the vault chip — no extra id→name lookup.
  const resolveVaultName = useMemo(() => {
    const byId = new Map((vaultList ?? []).map((v) => [v.id, v.name]))
    return (vaultId: string) => byId.get(vaultId)
  }, [vaultList])

  const logs = useOrgAuditLogs(
    {
      eventType: csvParam(filter.eventType),
      agentId: csvParam(filter.agentId),
      userId: csvParam(filter.userId),
      vaultId: csvParam(filter.vaultId),
      from: filter.from || undefined,
      to: filter.to || undefined,
    },
    canView,
  )

  const allItems = useMemo(
    () => (logs.data?.pages ?? []).flatMap((p) => p.items),
    [logs.data],
  )

  const { resolveAgentName, agentOptions, userOptions, agentNameById } =
    useAuditAgentNames(allItems, canView)

  const filtered = useMemo(
    () => filterAuditLogs(allItems, { search: filter.search, agentNameById }),
    [allItems, filter.search, agentNameById],
  )

  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="px-4 py-4">
        <div className="mb-4 flex h-10 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
              {t('audit.pageTitle')}
            </h1>
            <p className="text-[11px] text-[var(--cv-t3)]">{t('audit.pageSubtitle')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="subtle"
              size="sm"
              icon="palette"
              onClick={() => setLegendOpen(true)}
            >
              {t('audit.legend.action')}
            </Button>
            {/* TODO(CVT-141): wire to the backend async CSV export job once it ships.
                Native `title` (not the truncation-only Tooltip) so the hint shows
                on the disabled button. */}
            <Button
              variant="subtle"
              size="sm"
              icon="download"
              disabled
              title={t('audit.exportComingSoon')}
            >
              {t('audit.exportCsv')}
            </Button>
          </div>
        </div>

        <AuditFilterBar
          value={filter}
          onChange={setFilter}
          agentOptions={agentOptions}
          userOptions={userOptions}
          vaultOptions={vaultOptions}
        />

        <AuditLogList
          items={filtered}
          isPending={logs.isPending}
          isError={logs.isError}
          onRetry={() => logs.refetch()}
          hasNextPage={logs.hasNextPage}
          isFetchingNextPage={logs.isFetchingNextPage}
          onLoadMore={() => logs.fetchNextPage()}
          resolveAgentName={resolveAgentName}
          resolveVaultName={resolveVaultName}
          showVault
          emptyMessage={t('audit.emptyLog')}
          canView={canView}
        />
      </div>

      {legendOpen && (
        <ModalShell
          onClose={() => setLegendOpen(false)}
          ariaLabel={t('audit.legend.title')}
          width={560}
        >
          {/* The full taxonomy is tall — keep it scrollable inside the modal. */}
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <AuditLogLegend categories={AUDIT_EVENT_CATEGORIES} />
          </div>
        </ModalShell>
      )}
    </div>
  )
}
