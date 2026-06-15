import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import {
  ApproveGrantDialog,
  DenyGrantDialog,
  GrantAgainDialog,
  RevokeGrantDialog,
  useApproveGrant,
  useDenyGrant,
  useRegrant,
  useRevokeOrgGrant,
  type GrantMethod,
  type GrantPolicyBody,
} from '../grants'
import type { PendingGrant } from '../grants'
import type { OrgGrant } from '../grants/api/org-grants-api'
import { GRANT_TYPE_GRANULAR } from '../grants/api/org-grants-api'
import { NotificationCard } from './notification-card'
import {
  notificationGrantContext,
  type NotificationGrantContext,
} from './notification-grant-context'
import type { NotificationItem } from './notifications-api'
import {
  NOTIFICATIONS_QUERY_KEY,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsSummary,
} from './notification-queries'

type Segment = 'all' | 'todo' | 'history'

/**
 * Notification Center / Inbox (CVT-164) — replaces the Approvals surface with a
 * persistent feed of action-required + informational notifications.
 *
 * Layout follows the approved design 1:1: header + segment (All / To-do /
 * History), a search row (input + "Filter" button), then a "Required actions"
 * section (action-required cards with approve/deny/update) and a "History"
 * section (interactive: active→revoke, revoked/denied→grant again, terminal→
 * "agent has active access") linking out to the Audit Log.
 *
 * All grant actions reuse the existing zero-knowledge flows — the crypto is
 * untouched; only the ids come from notification `metadata`.
 */
export function NotificationCenterPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const notifications = useNotifications()
  const summary = useNotificationsSummary()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  // Refresh the feed + summary after a grant action so the resolved card drops
  // out (and its buttons disable) immediately, instead of lingering up to the
  // 15s staleTime — which risks a double-submit. The grant mutations already
  // invalidate ['grants']; this covers the notifications side.
  const refreshFeed = () =>
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })

  const [segment, setSegment] = useState<Segment>('all')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Grant-action mutations + dialog targets (shared across both sections).
  const approve = useApproveGrant()
  const deny = useDenyGrant()
  const revoke = useRevokeOrgGrant()
  const regrant = useRegrant()
  const [approveTarget, setApproveTarget] = useState<NotificationGrantContext | null>(null)
  const [denyTarget, setDenyTarget] = useState<NotificationGrantContext | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<NotificationGrantContext | null>(null)
  const [regrantTarget, setRegrantTarget] = useState<NotificationGrantContext | null>(null)
  const busy = approve.isPending || deny.isPending || revoke.isPending || regrant.isPending

  const items = useMemo(
    () => notifications.data?.pages.flatMap((page) => page.items) ?? [],
    [notifications.data],
  )

  const { actionItems, historyItems } = useMemo(() => splitByCategory(items), [items])

  const filteredActions = useMemo(
    () => filterByQuery(actionItems, query),
    [actionItems, query],
  )
  const filteredHistory = useMemo(
    () => filterByQuery(historyItems, query),
    [historyItems, query],
  )

  const showActions = segment === 'all' || segment === 'todo'
  const showHistory = segment === 'all' || segment === 'history'

  function handleApprove(policy: GrantPolicyBody, methods: GrantMethod[]) {
    if (!approveTarget) return
    approve.mutate(
      {
        grantId: approveTarget.grantId,
        vaultId: approveTarget.vaultId,
        entryId: approveTarget.entryId,
        agentPublicKey: approveTarget.agentPublicKey,
        policy,
        methods,
      },
      {
        onSuccess: () => {
          toast.success(t('grants.approve.success'))
          setApproveTarget(null)
          refreshFeed()
        },
        onError: () => toast.error(t('grants.approve.error')),
      },
    )
  }

  function handleDeny(reason: string) {
    if (!denyTarget) return
    deny.mutate(
      { vaultId: denyTarget.vaultId, grantId: denyTarget.grantId, reason },
      {
        onSuccess: () => {
          toast.success(t('grants.deny.success'))
          setDenyTarget(null)
          refreshFeed()
        },
        onError: () => toast.error(t('grants.deny.error')),
      },
    )
  }

  function handleRevoke(reason: string) {
    if (!revokeTarget) return
    revoke.mutate(
      { vaultId: revokeTarget.vaultId, grantId: revokeTarget.grantId, reason },
      {
        onSuccess: () => {
          toast.success(t('grants.revoke.success'))
          setRevokeTarget(null)
          refreshFeed()
        },
        onError: () => toast.error(t('grants.revoke.error')),
      },
    )
  }

  function handleRegrant(policy: GrantPolicyBody) {
    if (!regrantTarget?.agentId || !regrantTarget.entryId) return
    regrant.mutate(
      {
        vaultId: regrantTarget.vaultId,
        agentId: regrantTarget.agentId,
        entryId: regrantTarget.entryId,
        agentPublicKey: regrantTarget.agentPublicKey,
        type: GRANT_TYPE_GRANULAR,
        policy,
      },
      {
        onSuccess: () => {
          toast.success(t('grants.regrant.success'))
          setRegrantTarget(null)
          refreshFeed()
        },
        onError: () => toast.error(t('grants.regrant.error')),
      },
    )
  }

  return (
    <div className="min-h-full px-7 py-6 text-[var(--cv-t1)]">
      {/* Header + segment */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold">{t('notifications.center.title')}</h1>
          <p className="mt-0.5 text-[12px] text-[var(--cv-t3)]">
            {t('notifications.center.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentControl
            segment={segment}
            onChange={setSegment}
            todoCount={summary.data?.pendingActionCount ?? 0}
          />
          <Button
            variant="subtle"
            size="sm"
            icon="done_all"
            disabled={(summary.data?.unreadCount ?? 0) === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {t('notifications.center.markAllRead')}
          </Button>
          <Link
            to="/inbox/preferences"
            aria-label={t('notifications.prefs.title')}
            title={t('notifications.prefs.title')}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[var(--cv-btn-subtle-border)] bg-[var(--cv-btn-subtle-bg)] text-[var(--cv-t2)] transition-colors hover:bg-[var(--cv-btn-subtle-hover)]"
          >
            <Icon name="settings" size={16} />
          </Link>
        </div>
      </div>

      {/* Search row: input + Filter button (org-grants-panel style) */}
      <div className="mb-5 flex gap-2">
        <div className="flex flex-1 items-center gap-2.5 rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3 py-2 focus-within:border-[var(--cv-t1)]">
          <Icon name="search" size={16} color="var(--cv-t3)" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('notifications.center.search')}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--cv-t1)] outline-none placeholder:text-[var(--cv-t3)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3 text-[12px] font-medium text-[var(--cv-t2)] transition-colors hover:border-[var(--cv-t1)]"
          style={{ color: filtersOpen ? '#FF4F4F' : undefined }}
        >
          <Icon name="filter_alt" size={14} />
          {t('notifications.center.filter')}
          <Icon name="expand_more" size={14} />
        </button>
      </div>

      {notifications.isPending ? (
        <LoadingSkeleton />
      ) : notifications.isError ? (
        <ErrorState
          message={t('notifications.center.errorLoad')}
          onRetry={notifications.refetch}
        />
      ) : items.length === 0 ? (
        <EmptyState filtered={false} />
      ) : (
        <>
          {showActions && (
            <Section
              icon="warning"
              iconColor="#FF4F4F"
              title={t('notifications.center.requiredActions')}
              count={filteredActions.length}
            >
              {filteredActions.length === 0 ? (
                <EmptyState filtered={Boolean(query)} />
              ) : (
                <Grid>
                  {filteredActions.map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      footer={
                        <ActionFooter
                          item={item}
                          busy={busy}
                          onApprove={setApproveTarget}
                          onDeny={setDenyTarget}
                          onMarkRead={(id) => markRead.mutate(id)}
                        />
                      }
                    />
                  ))}
                </Grid>
              )}
            </Section>
          )}

          {showHistory && (
            <Section
              title={t('notifications.center.history')}
              trailing={
                <Link
                  to="/inbox"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#60A5FA]"
                  aria-disabled
                  onClick={(e) => e.preventDefault()}
                  title={t('notifications.center.auditLogSoon')}
                >
                  ({t('notifications.center.auditLog')} →)
                </Link>
              }
            >
              {filteredHistory.length === 0 ? (
                <EmptyState filtered={Boolean(query)} />
              ) : (
                <Grid>
                  {filteredHistory.map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      footer={
                        <HistoryFooter
                          item={item}
                          busy={busy}
                          onRevoke={setRevokeTarget}
                          onRegrant={setRegrantTarget}
                        />
                      }
                    />
                  ))}
                </Grid>
              )}
            </Section>
          )}

          {notifications.hasNextPage && (
            <div className="mt-2 flex justify-center">
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
        </>
      )}

      {/* Dialogs — reuse the existing grant flows (crypto unchanged) */}
      {approveTarget && (
        <ApproveGrantDialog
          grant={toPendingGrant(approveTarget)}
          isPending={approve.isPending}
          onConfirm={handleApprove}
          onCancel={() => setApproveTarget(null)}
        />
      )}
      <DenyGrantDialog
        open={denyTarget !== null}
        targetLabel={denyTarget?.entryLabel ?? t('grants.unknownTarget')}
        isPending={deny.isPending}
        onConfirm={handleDeny}
        onCancel={() => setDenyTarget(null)}
      />
      <RevokeGrantDialog
        open={revokeTarget !== null}
        targetLabel={revokeTarget?.entryLabel ?? t('grants.unknownTarget')}
        isPending={revoke.isPending}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
      {regrantTarget && (
        <GrantAgainDialog
          grant={toOrgGrant(regrantTarget)}
          isPending={regrant.isPending}
          onConfirm={handleRegrant}
          onCancel={() => setRegrantTarget(null)}
        />
      )}
    </div>
  )
}

/** action-required → To-do; everything else → History. */
function splitByCategory(items: NotificationItem[]) {
  const actionItems: NotificationItem[] = []
  const historyItems: NotificationItem[] = []
  for (const item of items) {
    if (item.category === 'actionRequired' && item.actionState !== 'resolved') {
      actionItems.push(item)
    } else {
      historyItems.push(item)
    }
  }
  return { actionItems, historyItems }
}

function filterByQuery(items: NotificationItem[], query: string): NotificationItem[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return items
  return items.filter((item) => {
    const haystack = Object.values(item.metadata ?? {})
      .join(' ')
      .toLocaleLowerCase()
    return haystack.includes(needle)
  })
}

/** Footer for action-required cards — type-specific buttons. */
function ActionFooter({
  item,
  busy,
  onApprove,
  onDeny,
  onMarkRead,
}: {
  item: NotificationItem
  busy: boolean
  onApprove: (ctx: NotificationGrantContext) => void
  onDeny: (ctx: NotificationGrantContext) => void
  onMarkRead: (id: string) => void
}) {
  const { t } = useTranslation()
  const ctx = notificationGrantContext(item)

  if (item.type === 'grant_pending' && ctx) {
    return (
      <>
        <Button variant="subtle" size="sm" className="flex-1" disabled={busy} onClick={() => onDeny(ctx)}>
          {t('grants.deny.action')}
        </Button>
        <Button variant="positive" size="sm" icon="check" className="flex-1" disabled={busy} onClick={() => onApprove(ctx)}>
          {t('grants.approve.action')}
        </Button>
      </>
    )
  }

  if (item.type === 'agent_pending') {
    const agentId = item.metadata?.agentId
    return (
      <>
        <Button variant="subtle" size="sm" className="flex-1" disabled={busy} onClick={() => onMarkRead(item.id)}>
          {t('notifications.center.dismiss')}
        </Button>
        {agentId ? (
          <Link
            to="/agents/$agentId"
            params={{ agentId }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[rgba(46,196,182,0.3)] bg-[rgba(46,196,182,0.06)] px-2.5 py-1.5 text-[11px] font-semibold text-[#2EC4B6] transition-colors hover:bg-[rgba(46,196,182,0.12)]"
          >
            <Icon name="check" size={14} />
            {t('notifications.center.review')}
          </Link>
        ) : null}
      </>
    )
  }

  if (item.type === 'credential_stale') {
    const vaultId = item.metadata?.vaultId
    const entryId = item.metadata?.entryId
    return (
      <>
        <Button variant="subtle" size="sm" className="flex-1" disabled={busy} onClick={() => onMarkRead(item.id)}>
          {t('notifications.center.dismiss')}
        </Button>
        {vaultId && entryId ? (
          <Link
            to="/vaults/$vaultId/entries/$entryId"
            params={{ vaultId, entryId }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[rgba(46,196,182,0.3)] bg-[rgba(46,196,182,0.06)] px-2.5 py-1.5 text-[11px] font-semibold text-[#2EC4B6] transition-colors hover:bg-[rgba(46,196,182,0.12)]"
          >
            <Icon name="refresh" size={14} />
            {t('notifications.center.update')}
          </Link>
        ) : null}
      </>
    )
  }

  // Action-required type the client doesn't model — offer dismiss only.
  return (
    <Button variant="subtle" size="sm" className="flex-1" disabled={busy} onClick={() => onMarkRead(item.id)}>
      {t('notifications.center.dismiss')}
    </Button>
  )
}

/** Footer for History cards — revoke active, grant-again terminal, else note. */
function HistoryFooter({
  item,
  busy,
  onRevoke,
  onRegrant,
}: {
  item: NotificationItem
  busy: boolean
  onRevoke: (ctx: NotificationGrantContext) => void
  onRegrant: (ctx: NotificationGrantContext) => void
}) {
  const { t } = useTranslation()
  const ctx = notificationGrantContext(item)

  if (item.type === 'grant_approved' && ctx) {
    // Active grant: offer revoke, unless already resolved/terminal elsewhere.
    if (item.actionState === 'resolved') {
      return (
        <span className="flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-[#2EC4B6]">
          <Icon name="check_circle" size={14} />
          {t('notifications.center.agentHasAccess')}
        </span>
      )
    }
    return (
      <Button variant="danger" size="sm" icon="close" className="flex-1" disabled={busy} onClick={() => onRevoke(ctx)}>
        {t('grants.revoke.action')}
      </Button>
    )
  }

  if ((item.type === 'grant_revoked' || item.type === 'grant_denied') && ctx?.agentId && ctx.entryId) {
    return (
      <Button variant="positive" size="sm" icon="refresh" className="flex-1" disabled={busy} onClick={() => onRegrant(ctx)}>
        {t('grants.regrant.action')}
      </Button>
    )
  }

  return null
}

/** Synthesize the minimal PendingGrant the approve dialog needs from metadata. */
function toPendingGrant(ctx: NotificationGrantContext): PendingGrant {
  return {
    id: ctx.grantId,
    vaultId: ctx.vaultId,
    vaultName: ctx.vaultName,
    agentId: ctx.agentId,
    agentName: ctx.agentName,
    entryId: ctx.entryId,
    entryLabel: ctx.entryLabel,
    methods: ctx.methods,
    agentPublicKey: ctx.agentPublicKey,
    createdAt: new Date().toISOString(),
  } as PendingGrant
}

/** Synthesize the minimal OrgGrant the grant-again dialog needs from metadata. */
function toOrgGrant(ctx: NotificationGrantContext): OrgGrant {
  return {
    id: ctx.grantId,
    vaultId: ctx.vaultId,
    vaultName: ctx.vaultName,
    agentId: ctx.agentId,
    agentName: ctx.agentName,
    agentPublicKey: ctx.agentPublicKey,
    entryId: ctx.entryId,
    entryLabel: ctx.entryLabel,
    status: 'revoked',
    createdAt: new Date().toISOString(),
    canRevoke: false,
    canGrantAgain: true,
  } as OrgGrant
}

function SegmentControl({
  segment,
  onChange,
  todoCount,
}: {
  segment: Segment
  onChange: (segment: Segment) => void
  todoCount: number
}) {
  const { t } = useTranslation()
  const options: { key: Segment; label: string; count?: number }[] = [
    { key: 'all', label: t('notifications.center.segAll') },
    { key: 'todo', label: t('notifications.center.segTodo'), count: todoCount },
    { key: 'history', label: t('notifications.center.segHistory') },
  ]
  return (
    <div className="inline-flex rounded-[10px] bg-[var(--cv-btn-subtle-bg)] p-[3px]">
      {options.map((option) => {
        const active = segment === option.key
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              active ? 'bg-[#FF4F4F] text-white' : 'text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
            }`}
          >
            {option.label}
            {option.count ? (
              <span
                className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={
                  active
                    ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                    : { background: 'rgba(255,79,79,0.15)', color: '#FF4F4F' }
                }
              >
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function Section({
  icon,
  iconColor,
  title,
  count,
  trailing,
  children,
}: {
  icon?: string
  iconColor?: string
  title: string
  count?: number
  trailing?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--cv-t3)]">
        {icon && <Icon name={icon} size={14} color={iconColor} />}
        {title}
        {count ? (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[rgba(255,79,79,0.15)] px-1.5 text-[10px] font-bold tracking-normal text-[#FF4F4F]">
            {count}
          </span>
        ) : null}
        {trailing && <span className="font-normal normal-case tracking-normal">{trailing}</span>}
      </p>
      {children}
    </section>
  )
}

/** Responsive card grid — auto-fill, min 340px (matches the approved design). */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid items-start gap-2.5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}
    >
      {children}
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center">
      <Icon name={filtered ? 'filter_alt_off' : 'check_circle'} size={28} color="var(--cv-t3)" />
      <p className="text-[12px] font-medium text-[var(--cv-t3)]">
        {t(filtered ? 'notifications.center.emptyFiltered' : 'notifications.center.empty')}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div
      className="grid items-start gap-2.5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}
    >
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-[150px] animate-pulse rounded-xl bg-[var(--cv-card-bg)]" />
      ))}
    </div>
  )
}
