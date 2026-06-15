import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../auth'
import { PendingGrantsPanel } from '../grants/components/pending-grants-panel'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { formatGrantDate, formatRelativeTime } from '../grants/components/grant-format'
import type { NotificationItem } from './notifications-api'
import { safeInternalTarget } from './notification-target'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsSummary,
} from './notification-queries'

type StatusFilter = 'all' | 'unread' | 'action' | 'security'

const TOPIC_COLORS = ['#2EC4B6', '#60A5FA', '#A78BFA', '#F0C040', '#FF8A65']

export function NotificationCenterPage() {
  const { t } = useTranslation()
  const permissions = useAuthStore((s) => s.permissions)
  const canManageGrants = (permissions & PERMISSION_GRANT_MANAGE) !== 0
  const notifications = useNotifications()
  const summary = useNotificationsSummary()
  const markAllRead = useMarkAllNotificationsRead()
  const markRead = useMarkNotificationRead()
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [topic, setTopic] = useState<string | null>(null)

  const items = useMemo(
    () => notifications.data?.pages.flatMap((page) => page.items) ?? [],
    [notifications.data],
  )
  const topics = useMemo(
    () => [...new Set(items.map((item) => item.topic))].sort(),
    [items],
  )
  const openActions = items.filter((item) => item.isActionRequired && !item.isResolved)
  const filtered = items.filter((item) => {
    const needle = query.trim().toLocaleLowerCase()
    if (
      needle &&
      !`${item.title} ${item.body} ${item.topic}`.toLocaleLowerCase().includes(needle)
    ) {
      return false
    }
    if (topic && item.topic !== topic) return false
    if (statusFilter === 'unread' && item.isRead) return false
    if (statusFilter === 'action' && (!item.isActionRequired || item.isResolved)) return false
    if (statusFilter === 'security' && !item.isSecurityCritical) return false
    return true
  })

  return (
    <div className="min-h-full px-6 py-5 text-[var(--cv-t1)]">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-bold">{t('notifications.center.title')}</h1>
          <p className="mt-1 text-[12px] text-[var(--cv-t3)]">
            {t('notifications.center.subtitle', {
              unread: summary.data?.unreadCount ?? 0,
              action: summary.data?.openActionRequiredCount ?? 0,
            })}
          </p>
        </div>
        <Button
          variant="subtle"
          size="sm"
          icon="done_all"
          disabled={(summary.data?.unreadCount ?? 0) === 0 || markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          {t('notifications.center.markAllRead')}
        </Button>
      </header>

      {(openActions.length > 0 || canManageGrants) && (
        <section className="mb-7">
          <SectionHeading
            icon="task_alt"
            title={t('notifications.center.todo')}
            subtitle={t('notifications.center.todoSubtitle')}
            count={summary.data?.openActionRequiredCount}
          />
          <div className={canManageGrants ? 'grid gap-4 xl:grid-cols-2' : ''}>
            {openActions.length > 0 && (
              <NotificationList
                items={openActions}
                onMarkRead={(id) => markRead.mutate(id)}
                compact
              />
            )}
            {canManageGrants && (
              <div className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
                <PendingGrantsPanel />
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <SectionHeading
          icon="inbox"
          title={t('notifications.center.all')}
          subtitle={t('notifications.center.allSubtitle')}
        />

        <div className="mb-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-[14px] py-[9px]">
            <Icon name="search" size={18} color="var(--cv-t3)" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('notifications.center.search')}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--cv-t1)] outline-none placeholder:text-[var(--cv-t3)]"
            />
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-label={t('notifications.center.filters')}
              aria-expanded={filtersOpen}
              className="flex text-[var(--cv-t3)] transition-colors hover:text-[#FF4F4F]"
              style={{ color: filtersOpen ? '#FF4F4F' : undefined }}
            >
              <Icon name="tune" size={18} />
            </button>
          </div>
          {filtersOpen && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['all', 'unread', 'action', 'security'] as const).map((filter) => (
                <FilterChip
                  key={filter}
                  active={statusFilter === filter}
                  onClick={() => setStatusFilter(filter)}
                >
                  {t(`notifications.center.filter.${filter}`)}
                </FilterChip>
              ))}
              {topics.map((value) => (
                <FilterChip
                  key={value}
                  active={topic === value}
                  onClick={() => setTopic(topic === value ? null : value)}
                >
                  {value}
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        {notifications.isPending ? (
          <LoadingSkeleton />
        ) : notifications.isError ? (
          <ErrorState
            message={t('notifications.center.errorLoad')}
            onRetry={notifications.refetch}
          />
        ) : filtered.length === 0 ? (
          <EmptyState filtered={items.length > 0} />
        ) : (
          <NotificationList items={filtered} onMarkRead={(id) => markRead.mutate(id)} />
        )}

        {notifications.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="subtle"
              size="sm"
              disabled={notifications.isFetchingNextPage}
              onClick={() => notifications.fetchNextPage()}
            >
              {t('notifications.center.loadMore')}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function SectionHeading({
  icon,
  title,
  subtitle,
  count,
}: {
  icon: string
  title: string
  subtitle: string
  count?: number
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon name={icon} size={18} color="#FF4F4F" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-bold">
          {title}
          {count ? <span className="ml-2 text-[#FF4F4F]">{count}</span> : null}
        </h2>
        <p className="text-[11px] text-[var(--cv-t3)]">{subtitle}</p>
      </div>
    </div>
  )
}

function NotificationList({
  items,
  onMarkRead,
  compact = false,
}: {
  items: NotificationItem[]
  onMarkRead: (id: string) => void
  compact?: boolean
}) {
  return (
    <ul className={compact ? 'flex flex-col gap-2' : 'grid gap-2 lg:grid-cols-2'}>
      {items.map((item, index) => (
        <li key={item.id}>
          <NotificationCard
            item={item}
            topicColor={TOPIC_COLORS[index % TOPIC_COLORS.length]}
            onMarkRead={() => onMarkRead(item.id)}
          />
        </li>
      ))}
    </ul>
  )
}

function NotificationCard({
  item,
  topicColor,
  onMarkRead,
}: {
  item: NotificationItem
  topicColor: string
  onMarkRead: () => void
}) {
  const { t } = useTranslation()
  const safeTarget = safeInternalTarget(item.actionTarget)

  return (
    <article
      className={`relative h-full overflow-hidden rounded-xl border bg-[var(--cv-card-bg)] p-[14px] ${
        item.isRead ? 'border-[var(--cv-border)]' : 'border-[rgba(255,79,79,0.28)]'
      }`}
    >
      {!item.isRead && (
        <span
          className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#FF4F4F]"
          aria-label={t('notifications.center.unread')}
        />
      )}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 pr-4">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ color: topicColor, background: `color-mix(in srgb, ${topicColor} 12%, transparent)` }}
        >
          {item.topic}
        </span>
        {item.isSecurityCritical && (
          <span className="rounded-full bg-[rgba(255,79,79,0.1)] px-2 py-0.5 text-[10px] font-semibold text-[#FF4F4F]">
            {t('notifications.center.security')}
          </span>
        )}
        {item.isResolved && (
          <span className="rounded-full bg-[var(--cv-bg-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cv-t3)]">
            {t('notifications.center.resolved')}
          </span>
        )}
      </div>
      <h3 className="text-[13px] font-semibold text-[var(--cv-t1)]">{item.title}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--cv-t2)]">{item.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--cv-divider)] pt-2.5">
        <span
          className="mr-auto text-[10px] text-[var(--cv-t3)]"
          title={formatGrantDate(item.occurredAt)}
        >
          {formatRelativeTime(item.occurredAt, t)}
        </span>
        {!item.isRead && (
          <Button variant="ghost" size="sm" onClick={onMarkRead}>
            {t('notifications.center.markRead')}
          </Button>
        )}
        {safeTarget && (
          <a
            href={safeTarget}
            onClick={() => {
              if (!item.isRead) onMarkRead()
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-[#FF4F4F] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#E04545]"
          >
            {t('notifications.center.open')}
            <Icon name="arrow_forward" size={13} />
          </a>
        )}
      </div>
    </article>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors ${
        active
          ? 'border-[rgba(255,79,79,0.35)] bg-[rgba(255,79,79,0.1)] text-[#FF4F4F]'
          : 'border-[var(--cv-border)] bg-[var(--cv-card-bg)] text-[var(--cv-t2)] hover:border-[rgba(255,79,79,0.25)]'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-10 text-center">
      <Icon name={filtered ? 'filter_alt_off' : 'inbox'} size={30} color="var(--cv-t3)" />
      <p className="text-[12px] font-medium text-[var(--cv-t3)]">
        {t(filtered ? 'notifications.center.emptyFiltered' : 'notifications.center.empty')}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-[150px] animate-pulse rounded-xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
