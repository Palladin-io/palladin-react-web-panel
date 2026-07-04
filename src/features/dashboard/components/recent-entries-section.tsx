import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import { PERMISSION_GRANT_MANAGE } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import {
  type EntrySearchItem,
  formatRelativeTime,
  useRecentEntries,
} from '../../grants'
import {
  EntryIcon,
  type EntryType,
  normalizeEntryType,
} from '../../vaults'

/** How many recently modified entries the dashboard surfaces. */
const RECENT_LIMIT = 8

/**
 * "Recently added / modified" block for the dashboard — the latest entries
 * across every vault, ordered by `updatedAt` desc. Metadata only (label,
 * vault, timestamp): no secret is ever fetched or shown here. Reuses the
 * cross-vault entry-search client (`sort=recent`) and the canonical entry
 * icon presentation. Gated on GrantManage (the endpoint requires it) — hidden
 * entirely for viewers without it, so a lower-privilege user simply sees the
 * rest of the dashboard.
 */
export function RecentEntriesSection() {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canView = (permissions & PERMISSION_GRANT_MANAGE) !== 0

  const entries = useRecentEntries(RECENT_LIMIT, canView)

  if (!canView) return null

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--cv-t1)]">
          {t('dashboard.recentlyModified')}
        </span>
        <Link
          to="/vaults"
          className="text-xs font-medium text-[var(--cv-primary)] hover:underline"
        >
          {t('dashboard.viewAll')}
        </Link>
      </div>

      {entries.isPending ? (
        <ListSkeleton />
      ) : entries.isError ? (
        <ErrorState
          message={t('dashboard.recentEntriesError')}
          onRetry={() => entries.refetch()}
        />
      ) : entries.data.length === 0 ? (
        <EmptyState message={t('dashboard.noRecentEntries')} />
      ) : (
        <div className="flex flex-col gap-2">
          {entries.data.map((entry) => (
            <RecentEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}

function RecentEntryRow({ entry }: { entry: EntrySearchItem }) {
  const { t } = useTranslation()

  const type: EntryType = normalizeEntryType(entry.type)

  const timestamp = entry.updatedAt ?? entry.createdAt
  const meta = [entry.vaultName, timestamp ? formatRelativeTime(timestamp, t) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      to="/vaults/$vaultId/entries/$entryId"
      params={{ vaultId: entry.vaultId, entryId: entry.id }}
      className={`flex items-center gap-3 px-4 py-2.5 ${HOVERABLE_CARD_CLASSES}`}
    >
      <EntryIcon icon={entry.icon} type={type} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">
          {entry.label}
        </span>
        {meta ? (
          <span className="truncate text-[11px] text-[var(--cv-t3)]">{meta}</span>
        ) : null}
      </div>
    </Link>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
        border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
    >
      <Icon name="key" size={28} color="var(--cv-t3)" />
      <p className="text-[12px] font-medium text-[var(--cv-t3)]">{message}</p>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[57px] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
      ))}
    </div>
  )
}
