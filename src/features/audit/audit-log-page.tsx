import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { downloadFromUrl } from '../../shared/lib/download-file'
import { Button } from '../../shared/components/button'
import { ModalShell } from '../../shared/components/modal-shell'
import { ScrollArea } from '../../shared/components/scroll-area'
import { PERMISSION_AUDIT_VIEW } from '../../shared/lib/permissions'
import { shortenKey } from '../../shared/lib/shorten-key'
import { useAuthStore } from '../auth'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import { filterAuditLogs } from './audit-log-filter'
import {
  getAuditExport,
  getAuditExportDownloadUrl,
  requestAuditExport,
} from './api/audit-api'
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
  const [exporting, setExporting] = useState(false)

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const jobId = await requestAuditExport({
        eventType: csvParam(filter.eventType),
        agentId: csvParam(filter.agentId),
        userId: csvParam(filter.userId),
        vaultId: csvParam(filter.vaultId),
        from: filter.from || undefined,
        to: filter.to || undefined,
      })
      // The export runs as a background job — poll (exponential backoff, capped)
      // until the file is ready (24h-valid link).
      const deadline = Date.now() + 120_000
      let delay = 1000
      while (Date.now() < deadline) {
        const status = await getAuditExport(jobId)
        if (status.downloadable) {
          toast.success(t('audit.exportReady'))
          downloadFromUrl(await getAuditExportDownloadUrl(jobId))
          return
        }
        if (status.status.toLowerCase() === 'failed') break
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay = Math.min(delay * 2, 5000)
      }
      toast.error(t('audit.exportFailed'))
    } catch (error) {
      if (error instanceof HTTPError) {
        const body = (await error.response.clone().json().catch(() => null)) as {
          code?: string
          message?: string
        } | null
        if (body?.code === 'plan-upgrade-required') {
          toast.info(t('audit.exportProOnly'))
          return
        }
      }
      toast.error(t('audit.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const memberVaults = useMemberSyncStore((state) => state.vaults)
  const vaultOptions = useMemo(
    () => [...memberVaults.values()].map((vault) => ({
      value: vault.vaultId,
      label: vault.metadata?.name ?? shortenKey(vault.vaultId),
    })),
    [memberVaults],
  )

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

  const {
    resolveAgentName,
    resolveActorName,
    agentOptions,
    userOptions,
    agentNameById,
    memberNameById,
  } =
    useAuditAgentNames(allItems, canView)

  const { entryNameById, vaultNameById } = useMemo(() => {
    const entryNames: Record<string, string> = {}
    const vaultNames: Record<string, string> = {}
    for (const item of allItems) {
      if (item.vaultId) {
        const vault = memberVaults.get(item.vaultId)
        vaultNames[item.vaultId] = vault?.metadata?.name ?? shortenKey(item.vaultId)
        if (item.entryId) {
          const record = vault?.entries.get(item.entryId)
          entryNames[item.entryId] = !record?.corrupt && record?.payload?.memberLabel
            ? record.payload.memberLabel
            : shortenKey(item.entryId)
        }
      } else if (item.entryId) {
        entryNames[item.entryId] = shortenKey(item.entryId)
      }
    }
    return { entryNameById: entryNames, vaultNameById: vaultNames }
  }, [allItems, memberVaults])

  const resolveEntryName = (entryId: string) => entryNameById[entryId] ?? shortenKey(entryId)
  const resolveVaultName = (vaultId: string) => vaultNameById[vaultId] ?? shortenKey(vaultId)

  const filtered = useMemo(
    () => filterAuditLogs(allItems, {
      search: filter.search,
      agentNameById,
      memberNameById,
      entryNameById,
      vaultNameById,
    }),
    [allItems, filter.search, agentNameById, memberNameById, entryNameById, vaultNameById],
  )

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-4 text-[var(--cv-t1)]">
      <div className="mb-4 flex h-10 shrink-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-heading font-bold text-[var(--cv-t1)]">
              {t('audit.pageTitle')}
            </h1>
            <p className="text-meta text-[var(--cv-t3)]">{t('audit.pageSubtitle')}</p>
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
            <Button
              variant="subtle"
              size="sm"
              icon="download"
              disabled={!canView || exporting}
              onClick={handleExportCsv}
            >
              {exporting ? t('audit.exporting') : t('audit.exportCsv')}
            </Button>
          </div>
        </div>

      <div className="shrink-0">
        <AuditFilterBar
          value={filter}
          onChange={setFilter}
          agentOptions={agentOptions}
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
          resolveAgentName={resolveAgentName}
          resolveActorName={resolveActorName}
          resolveEntryName={resolveEntryName}
          resolveVaultName={resolveVaultName}
          showVault
          emptyMessage={t('audit.emptyLog')}
          canView={canView}
          allowDenormalizedNames={false}
        />
      </ScrollArea>

      {legendOpen && (
        <ModalShell
          onClose={() => setLegendOpen(false)}
          ariaLabel={t('audit.legend.title')}
          title={t('audit.legend.title')}
          width={560}
        >
          <AuditLogLegend categories={AUDIT_EVENT_CATEGORIES} />
        </ModalShell>
      )}
    </div>
  )
}
