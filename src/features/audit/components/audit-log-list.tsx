import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { LoadMoreSentinel } from '../../../shared/components/load-more-sentinel'
import { Icon } from '../../../shared/components/icon'
import type { AuditLogItem } from '../api/audit-api'
import { AuditLogEntry } from './audit-log-entry'

export interface AuditLogListProps {
  items: AuditLogItem[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  /** True when the previous page load failed — shows the manual retry. */
  isFetchNextPageError?: boolean
  onLoadMore: () => void
  /** Resolve an agent id to a display name (falls back inside the row otherwise). */
  resolveAgentName?: (agentId: string) => string
  /** Resolve an opaque entry id from client-only decrypted state. */
  resolveEntryName?: (entryId: string) => string
  /** Resolve a vault id to a display name — drives the vault chip (global log only). */
  resolveVaultName?: (vaultId: string) => string | undefined
  /** Show the entry chip on each row — off when the entry is fixed (entry tab). */
  showEntry?: boolean
  /** Show the vault chip on each row — on only in the global log. */
  showVault?: boolean
  emptyMessage: string
  /** Shown instead of the list when the viewer lacks AuditView. */
  noPermissionMessage?: string
  canView?: boolean
}

/**
 * Shared renderer for an audit log: skeleton / error / empty / rows + a
 * "Load more" cursor button. Loading state replaces only the list area so the
 * caller's header and filter bar stay visible. Reused by the vault Audit Log
 * tab and the global Audit Log screen.
 */
export function AuditLogList({
  items,
  isPending,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError = false,
  onLoadMore,
  resolveAgentName,
  resolveEntryName,
  resolveVaultName,
  showEntry = true,
  showVault = false,
  emptyMessage,
  noPermissionMessage,
  canView = true,
}: AuditLogListProps) {
  const { t } = useTranslation()

  if (!canView) {
    return <EmptyState icon="lock" message={noPermissionMessage ?? t('audit.noPermission')} />
  }
  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState message={t('audit.errorLog')} onRetry={onRetry} />
  if (items.length === 0) return <EmptyState icon="history" message={emptyMessage} />

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
        {items.map((item, i) => (
          <AuditLogEntry
            key={item.id}
            item={item}
            agentName={
              item.agentId ? resolveAgentName?.(item.agentId) : undefined
            }
            entryName={item.entryId ? resolveEntryName?.(item.entryId) : undefined}
            vaultName={item.vaultId ? resolveVaultName?.(item.vaultId) : undefined}
            showEntry={showEntry}
            showVault={showVault}
            withDivider={i > 0}
          />
        ))}
      </div>
      <LoadMoreSentinel
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        onLoadMore={onLoadMore}
      />
    </>
  )
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
        border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
    >
      <Icon name={icon} size={28} color="var(--cv-t3)" />
      <p className="text-ui font-medium text-[var(--cv-t3)]">{message}</p>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[4.5rem] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
      ))}
    </div>
  )
}
