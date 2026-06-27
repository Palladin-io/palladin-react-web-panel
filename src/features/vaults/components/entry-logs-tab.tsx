import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { useAuthStore } from '../../auth'
import { PERMISSION_AUDIT_VIEW } from '../../../shared/lib/permissions'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { useAgentNames } from '../../agents'
import {
  AuditLogEntry,
  AuditLogLegend,
  ENTRY_RELEVANT_EVENT_TYPES,
  auditEventConfig,
  filterAuditLogs,
  useVaultAuditLogs,
} from '../../audit'

export interface EntryLogsTabProps {
  vaultId: string
  entryId: string
}

const SELECT_CLASS =
  'h-8 rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] ' +
  'px-2.5 text-[12px] text-[var(--cv-input-text)] focus:border-[var(--cv-t1)] ' +
  'focus:outline-none transition-colors'

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

  const [search, setSearch] = useState('')
  const [agentId, setAgentId] = useState('')
  const [eventType, setEventType] = useState('')
  const [legendOpen, setLegendOpen] = useState(false)

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
        agentId: agentId || undefined,
        eventType: eventType || undefined,
        search,
        agentNameById,
      }),
    [allItems, entryId, agentId, eventType, search, agentNameById],
  )

  // Agents that actually appear in this entry's log — keeps the dropdown short.
  const agentOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const item of allItems) {
      if (item.entryId === entryId && item.agentId) ids.add(item.agentId)
    }
    return [...ids].map((id) => ({ id, name: resolveAgentName(id) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, entryId, agentNameById])

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-4 @[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-stretch gap-2">
            <div
              className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border
                border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3
                transition-colors focus-within:border-[var(--cv-t1)]"
            >
              <Icon name="search" size={16} className="shrink-0 text-[var(--cv-input-placeholder)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('audit.searchPlaceholder')}
                className="h-8 flex-1 border-none bg-transparent text-[12px] text-[var(--cv-input-text)]
                  placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
              />
            </div>
            <select
              className={SELECT_CLASS}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              aria-label={t('audit.filterAgent')}
            >
              <option value="">{t('audit.allAgents')}</option>
              {agentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              className={SELECT_CLASS}
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              aria-label={t('audit.filterEvent')}
            >
              <option value="">{t('audit.allEvents')}</option>
              {ENTRY_RELEVANT_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(auditEventConfig(type).labelKey)}
                </option>
              ))}
            </select>
            <Button
              variant="subtle"
              size="sm"
              icon="palette"
              onClick={() => setLegendOpen(true)}
              className="@[1100px]:hidden"
            >
              {t('audit.legend.action')}
            </Button>
          </div>

          {!canView ? (
            <EmptyState icon="lock" message={t('audit.noPermission')} />
          ) : logs.isPending ? (
            <ListSkeleton />
          ) : logs.isError ? (
            <ErrorState message={t('audit.errorLoad')} onRetry={() => logs.refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState icon="history" message={t('audit.empty')} />
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
                {filtered.map((item, i) => (
                  <AuditLogEntry
                    key={item.id}
                    item={item}
                    agentName={item.agentId ? resolveAgentName(item.agentId) : undefined}
                    showEntry={false}
                    withDivider={i > 0}
                  />
                ))}
              </div>
              {logs.hasNextPage && (
                <div className="mt-3 flex justify-center">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => logs.fetchNextPage()}
                    disabled={logs.isFetchingNextPage}
                  >
                    {logs.isFetchingNextPage
                      ? t('audit.loadingMore')
                      : t('audit.loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="hidden @[1100px]:block">
          <div className="sticky top-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
            <AuditLogLegend />
          </div>
        </aside>
      </div>

      {legendOpen && (
        <ModalShell onClose={() => setLegendOpen(false)} ariaLabel={t('audit.legend.title')}>
          <AuditLogLegend />
        </ModalShell>
      )}
    </div>
  )
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
        border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
    >
      <Icon name={icon} size={28} color="var(--cv-t3)" />
      <p className="text-[12px] font-medium text-[var(--cv-t3)]">{message}</p>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
      ))}
    </div>
  )
}
