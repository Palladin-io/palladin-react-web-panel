import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button, POSITIVE_BUTTON_SM_CLASS } from '../../shared/components/button'
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
import {
  ApproveAgentDialog,
  useApproveAgent,
  useDeactivateAgent,
  type ApproveAgentInput,
} from '../agents'
import { NotificationCard } from './notification-card'
import { NotificationPreferencesDialog } from './notification-preferences-dialog'
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

/** Agent-approval target carried from an `agent_pending` card to the modal. */
interface AgentTarget {
  agentId: string
  agentName: string
  notificationId: string
}

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
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [prefsOpen, setPrefsOpen] = useState(false)

  // Grant-action mutations + dialog targets (shared across both sections).
  const approve = useApproveGrant()
  const deny = useDenyGrant()
  const revoke = useRevokeOrgGrant()
  const regrant = useRegrant()
  const approveAgent = useApproveAgent()
  const deactivateAgent = useDeactivateAgent()
  const [approveTarget, setApproveTarget] = useState<NotificationGrantContext | null>(null)
  const [denyTarget, setDenyTarget] = useState<NotificationGrantContext | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<NotificationGrantContext | null>(null)
  const [regrantTarget, setRegrantTarget] = useState<NotificationGrantContext | null>(null)
  // Agent approval target — opens the existing agent-activation modal.
  const [agentApproveTarget, setAgentApproveTarget] = useState<AgentTarget | null>(null)
  const busy =
    approve.isPending ||
    deny.isPending ||
    revoke.isPending ||
    regrant.isPending ||
    approveAgent.isPending ||
    deactivateAgent.isPending

  // Mark a notification read. `markRead` is purely optimistic (patches `readAt`
  // in the feed cache + drops the badge) — no feed invalidation, so this never
  // remounts cards or re-triggers the mark-read-on-view observer.
  function markReadNow(id: string) {
    markRead.mutate(id)
  }

  const items = useMemo(
    () => notifications.data?.pages.flatMap((page) => page.items) ?? [],
    [notifications.data],
  )

  const { actionItems, historyItems } = useMemo(() => splitByCategory(items), [items])

  const filteredActions = useMemo(
    () => filterItems(actionItems, query, typeFilter),
    [actionItems, query, typeFilter],
  )
  const filteredHistory = useMemo(
    () => filterItems(historyItems, query, typeFilter),
    [historyItems, query, typeFilter],
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

  function handleApproveAgent(input: ApproveAgentInput) {
    if (!agentApproveTarget) return
    approveAgent.mutate(
      { agentId: agentApproveTarget.agentId, input },
      {
        onSuccess: () => {
          toast.success(t('agents.approveSuccess'))
          setAgentApproveTarget(null)
          refreshFeed()
        },
        onError: () => toast.error(t('agents.errorApprove')),
      },
    )
  }

  function handleDenyAgent(agentId: string, notificationId: string) {
    // "Deny" a pending agent = deactivate it (no separate reject endpoint).
    deactivateAgent.mutate(agentId, {
      onSuccess: () => {
        toast.success(t('agents.deactivateSuccess'))
        markReadNow(notificationId)
      },
      onError: () => toast.error(t('agents.errorDeactivate')),
    })
  }

  return (
    <div className="min-h-full px-4 py-4 text-[var(--cv-t1)]">
      {/* Header row — app-standard `h-10` (same as Agents/Vaults/org-grants) so
          the search below sits at the same height across every list screen.
          Title/subtitle on the left; segment tabs + actions inline on the right. */}
      <div className="mb-4 flex h-10 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
            {t('notifications.center.title')}
          </h2>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('notifications.center.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SegmentTabs
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
          <Button
            variant="accent"
            size="sm"
            icon="settings"
            aria-label={t('notifications.prefs.title')}
            title={t('notifications.prefs.title')}
            onClick={() => setPrefsOpen(true)}
          />
        </div>
      </div>

      {/* Search (left) + multi-select type filter (right) — org-grants pattern */}
      <div className="mb-3 flex items-stretch gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-3 py-2 transition-colors focus-within:border-[var(--cv-t1)]">
          <Icon name="search" size={16} className="shrink-0 text-[var(--cv-input-placeholder)]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('notifications.center.search')}
            className="flex-1 border-none bg-transparent text-[12px] text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
          />
        </div>
        <TypeFilterDropdown selected={typeFilter} onChange={setTypeFilter} />
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
          {/* Action-required cards render with no section label — just the
              cards at the top of the inbox. */}
          {showActions &&
            (filteredActions.length === 0 ? (
              segment === 'todo' ? <EmptyState filtered={Boolean(query)} /> : null
            ) : (
              <div className="mb-4">
                <Grid>
                  {filteredActions.map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      onSeen={(id) => markRead.mutate(id)}
                      footer={
                        <ActionFooter
                          item={item}
                          busy={busy}
                          onApprove={setApproveTarget}
                          onDeny={setDenyTarget}
                          onApproveAgent={setAgentApproveTarget}
                          onDenyAgent={handleDenyAgent}
                          onMarkRead={markReadNow}
                        />
                      }
                    />
                  ))}
                </Grid>
              </div>
            ))}

          {showHistory && (
            <section>
              {/* Section label only when a To-do section with cards is rendered
                  above it — never show "History" as the first/only section. */}
              {showActions && filteredActions.length > 0 && (
                <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-[var(--cv-t3)]">
                  {t('notifications.center.history')}
                  <span className="font-medium" title={t('notifications.center.auditLogSoon')}>
                    ({t('notifications.center.auditLog')})
                  </span>
                </p>
              )}
              {filteredHistory.length === 0 ? (
                <EmptyState filtered={Boolean(query)} />
              ) : (
                <Grid>
                  {filteredHistory.map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      onSeen={(id) => markRead.mutate(id)}
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
            </section>
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

      {agentApproveTarget && (
        <ApproveAgentDialog
          open
          agentId={agentApproveTarget.agentId}
          agentName={agentApproveTarget.agentName}
          initialName={agentApproveTarget.agentName}
          isPending={approveAgent.isPending}
          onConfirm={handleApproveAgent}
          onCancel={() => setAgentApproveTarget(null)}
        />
      )}

      {prefsOpen && (
        <NotificationPreferencesDialog onClose={() => setPrefsOpen(false)} />
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

/** Filter by free-text search (over metadata) AND the selected type set. */
function filterItems(
  items: NotificationItem[],
  query: string,
  types: Set<string>,
): NotificationItem[] {
  const needle = query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (types.size > 0 && !types.has(item.type)) return false
    if (!needle) return true
    const haystack = Object.values(item.metadata ?? {})
      .join(' ')
      .toLocaleLowerCase()
    return haystack.includes(needle)
  })
}

/**
 * Footer for action-required cards. Every button is `size="sm"` + `flex-1` so
 * the two slots are always equal width and height (the `POSITIVE_BUTTON_SM_CLASS`
 * link shares the same base classes as `<Button>`, so a link CTA matches a
 * button CTA exactly).
 */
function ActionFooter({
  item,
  busy,
  onApprove,
  onDeny,
  onApproveAgent,
  onDenyAgent,
  onMarkRead,
}: {
  item: NotificationItem
  busy: boolean
  onApprove: (ctx: NotificationGrantContext) => void
  onDeny: (ctx: NotificationGrantContext) => void
  onApproveAgent: (target: AgentTarget) => void
  onDenyAgent: (agentId: string, notificationId: string) => void
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
    // Without an agentId we can't drive the approve/deactivate flow — degrade
    // to a dismiss so the card still resolves.
    if (!agentId) {
      return (
        <Button variant="subtle" size="sm" className="flex-1" disabled={busy} onClick={() => onMarkRead(item.id)}>
          {t('notifications.center.dismiss')}
        </Button>
      )
    }
    const agentName = item.metadata?.agentName ?? ''
    return (
      <>
        <Button
          variant="subtle"
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() => onDenyAgent(agentId, item.id)}
        >
          {t('grants.deny.action')}
        </Button>
        <Button
          variant="positive"
          size="sm"
                   className="flex-1"
          disabled={busy}
          onClick={() => onApproveAgent({ agentId, agentName, notificationId: item.id })}
        >
          {t('grants.approve.action')}
        </Button>
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
            onClick={() => onMarkRead(item.id)}
            className={`${POSITIVE_BUTTON_SM_CLASS} flex-1`}
          >
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
      <Button variant="danger" size="sm" className="flex-1" disabled={busy} onClick={() => onRevoke(ctx)}>
        {t('grants.revoke.action')}
      </Button>
    )
  }

  if ((item.type === 'grant_revoked' || item.type === 'grant_denied') && ctx?.agentId && ctx.entryId) {
    return (
      <Button variant="positive" size="sm" className="flex-1" disabled={busy} onClick={() => onRegrant(ctx)}>
        {t('grants.regrant.action')}
      </Button>
    )
  }

  // agent_approved (informational): deep-link to the agent to review it.
  if (item.type === 'agent_approved') {
    const agentId = item.metadata?.agentId
    if (!agentId) return null
    return (
      <Link
        to="/agents/$agentId"
        params={{ agentId }}
        className={`${POSITIVE_BUTTON_SM_CLASS} flex-1`}
      >
        {t('notifications.center.review')}
      </Link>
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

/** Notification types offered in the filter dropdown (matches the taxonomy). */
const FILTERABLE_TYPES = [
  'agent_pending',
  'grant_pending',
  'credential_stale',
  'grant_approved',
  'grant_denied',
  'grant_revoked',
  'agent_approved',
] as const

/**
 * Multi-select type filter — same pattern as org-grants `StatusFilterDropdown`:
 * a `filter_list` button + a checkbox list, multi-select, with a "clear" row.
 * Filters the feed by notification `type`.
 */
function TypeFilterDropdown({
  selected,
  onChange,
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function toggle(type: string) {
    const next = new Set(selected)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    onChange(next)
  }

  const label =
    selected.size === 0
      ? t('notifications.center.filterType')
      : t('notifications.center.filterTypeCount', { count: selected.size })

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-full items-center gap-1.5 rounded-lg border border-[var(--cv-input-border)]
          bg-[var(--cv-input-bg)] px-3 text-[12px] text-[var(--cv-t2)]
          transition-colors hover:border-[var(--cv-t1)]"
      >
        <Icon name="filter_list" size={15} />
        <span className="whitespace-nowrap">{label}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={15} />
      </button>

      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border
            border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1 shadow-xl"
          role="listbox"
          aria-multiselectable
        >
          {FILTERABLE_TYPES.map((type) => {
            const checked = selected.has(type)
            return (
              <button
                key={type}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(type)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]
                  text-[var(--cv-t1)] transition-colors hover:bg-[var(--cv-bg-subtle)]"
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                  style={{
                    borderColor: checked ? '#FF4F4F' : 'var(--cv-input-border)',
                    background: checked ? '#FF4F4F' : 'transparent',
                  }}
                >
                  {checked && <Icon name="check" size={11} color="#fff" />}
                </span>
                {t(`notifications.center.filterType.${type}`)}
              </button>
            )
          })}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mt-1 w-full border-t border-[var(--cv-divider)] px-3 py-1.5
                text-left text-[11px] text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
            >
              {t('notifications.center.filterClear')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Segment switcher — accent-underline active tab matching the app's tab idiom
 * (`VaultDetailTabs`), sized to sit inline in the header action row next to
 * "Mark all as read" / settings. The To-do tab carries a small count chip built
 * from `--cv-*` / `#FF4F4F` tokens.
 */
function SegmentTabs({
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
    <div className="mr-1 flex items-center" role="tablist">
      {options.map((option) => {
        const isActive = segment === option.key
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.key)}
            className={`flex items-center gap-1.5 border-b-2 px-2.5 py-1 text-[12px] transition-colors ${
              isActive
                ? 'border-[#FF4F4F] font-bold text-[#FF4F4F]'
                : 'border-transparent font-medium text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
            }`}
          >
            {option.label}
            {option.count ? (
              <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[rgba(255,79,79,0.15)] px-1 text-[10px] font-bold text-[#FF4F4F]">
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Responsive card grid — same auto-fill/min-340/`gap-[10px]` as the
 * org-grants-panel list, but `items-stretch` so every card in a row shares the
 * tallest card's height (cards are `h-full` flex columns). This gives the
 * uniform-height pending grid.
 */
function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-stretch gap-[10px]">
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start gap-[10px]">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-[150px] animate-pulse rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
