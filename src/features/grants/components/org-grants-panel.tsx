import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { Tooltip } from '../../../shared/components/tooltip'
import { useAuthStore } from '../../auth'
import { PERMISSION_GRANT_MANAGE } from '../../../shared/lib/permissions'
import { AgentAvatar } from '../../agents/components/agent-avatar'
import {
  GRANT_STATUS_PENDING,
  GRANT_TYPE_FULL,
  type GrantStatus,
  type OrgGrant,
} from '../api/org-grants-api'
import {
  accessLimitKind,
  grantActorName,
  grantStatusPresentation,
} from '../org-grant-presentation'
import type { GrantPolicyBody } from '../grant-policy'
import { useOrgGrants } from '../use-org-grants'
import { useRegrant } from '../use-regrant'
import { useRevokeOrgGrant } from '../use-revoke-org-grant'
import {
  formatExpiresIn,
  formatGrantDate,
  formatRelativeTime,
  timeBucket,
  type TimeBucket,
} from './grant-format'
import { GrantAgainDialog } from './grant-again-dialog'
import { RevokeGrantDialog } from './revoke-grant-dialog'

/** Statuses shown in this panel — Pending is excluded (handled on the left). */
const PANEL_STATUSES: GrantStatus[] = [
  'active',
  'expired',
  'consumed',
  'denied',
  'revoked',
]

/**
 * Right panel of the Approvals view: org-wide grants (every status EXCEPT
 * pending — those live in the left queue) with search, a multi-select status
 * dropdown, time grouping, a summary counter, and per-row actions (Revoke
 * active grants / Grant again for terminal ones). Gated on GrantManage.
 */
export interface OrgGrantsPanelProps {
  /**
   * Scope the panel to one of these (server-side filter). Lets the exact same
   * panel be embedded in several places — one component, many locations, so
   * future changes apply everywhere:
   * - `agentId` → Agent detail Grants tab (this agent's grants)
   * - `vaultId` → Vault detail Agents tab (FULL on the vault + GRANULAR on its entries)
   * - `entryId` → Entry detail Agents tab (only this exact entry)
   * Unset = the org-wide Approvals history.
   */
  agentId?: string
  vaultId?: string
  entryId?: string
  /**
   * Chromeless variant for the inbox Grants segment: drops the title/status-count
   * header and the time-bucket group labels, rendering one flat grid. The segment
   * tab already names the view, and the time markers add noise there.
   */
  bare?: boolean
}

export function OrgGrantsPanel({ agentId, vaultId, entryId, bare }: OrgGrantsPanelProps = {}) {
  const { t } = useTranslation()
  const [statusFilter, setStatusFilter] = useState<Set<GrantStatus>>(new Set())
  const [search, setSearch] = useState('')

  // Embedded = scoped to a single agent/vault/entry; the surrounding tab names
  // the section so the panel header is hidden.
  const embedded = Boolean(agentId || vaultId || entryId)

  // Gate the fetch on GrantManage — without it the backend returns 403, so the
  // embeds (agent/vault/entry tabs) must never trigger the request. Render a
  // self-contained empty state instead.
  const permissions = useAuthStore((s) => s.permissions)
  const canManage = (permissions & PERMISSION_GRANT_MANAGE) !== 0

  // Fetch the org list, scoped to the given filter (mutually exclusive embeds).
  // No server status filter — we filter client-side so the multi-select works
  // without N requests. Pending is always dropped here.
  const grants = useOrgGrants(
    agentId ? { agentId } : vaultId ? { vaultId } : entryId ? { entryId } : {},
    canManage,
  )
  const items = useMemo(
    () =>
      (grants.data?.items ?? []).filter((g) => g.status !== GRANT_STATUS_PENDING),
    [grants.data],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((g) => {
      if (statusFilter.size > 0 && !statusFilter.has(g.status)) return false
      if (!q) return true
      return [g.agentName, g.entryLabel, g.vaultName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [items, search, statusFilter])

  const summary = useMemo(() => summarise(items), [items])
  const groups = useMemo(() => groupByTime(filtered), [filtered])

  const revoke = useRevokeOrgGrant()
  const regrant = useRegrant()
  const [revokeTarget, setRevokeTarget] = useState<OrgGrant | null>(null)
  const [regrantTarget, setRegrantTarget] = useState<OrgGrant | null>(null)

  function handleRevoke(grant: OrgGrant, reason: string) {
    revoke.mutate(
      { vaultId: grant.vaultId, grantId: grant.id, reason },
      {
        onSuccess: () => {
          toast.success(t('grants.revoke.success'))
          setRevokeTarget(null)
        },
        onError: () => toast.error(t('grants.revoke.error')),
      },
    )
  }

  function handleRegrant(grant: OrgGrant, policy: GrantPolicyBody) {
    if (!grant.agentId || !grant.entryId || !grant.type) return
    regrant.mutate(
      {
        vaultId: grant.vaultId,
        agentId: grant.agentId,
        entryId: grant.entryId,
        agentPublicKey: grant.agentPublicKey,
        type: grant.type,
        policy,
      },
      {
        onSuccess: () => {
          toast.success(t('grants.regrant.success'))
          setRegrantTarget(null)
        },
        onError: () => toast.error(t('grants.regrant.error')),
      },
    )
  }

  return (
    <>
      {/* Header (title + status summary). Hidden in the per-agent embed — the
          surrounding tab already names the section. Uses the app-standard
          `h-10` header (same as Agents/Vaults and the left Pending panel) so
          the search bar sits at the same height across every list screen and
          the view doesn't jump when navigating. */}
      {!embedded && !bare && (
        <div className="mb-4 flex h-10 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
              {t('grants.org.title')}
            </h2>
            {summary && <p className="text-[11px] text-[var(--cv-t3)]">{summary}</p>}
          </div>
        </div>
      )}

      {/* Search (left) + status multi-select dropdown (right) */}
      <div className="mb-3 flex items-stretch gap-2">
        <div
          className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--cv-input-border)]
            bg-[var(--cv-input-bg)] px-3 py-2 transition-colors focus-within:border-[var(--cv-t1)]"
        >
          <Icon name="search" size={16} className="shrink-0 text-[var(--cv-input-placeholder)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('grants.org.searchPlaceholder')}
            className="flex-1 border-none bg-transparent text-[12px] text-[var(--cv-input-text)]
              placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
          />
        </div>
        <StatusFilterDropdown selected={statusFilter} onChange={setStatusFilter} />
      </div>

      {!canManage ? (
        <div
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
            border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
        >
          <Icon name="lock" size={28} color="var(--cv-t3)" />
          <p className="text-[12px] font-medium text-[var(--cv-t3)]">
            {t('grants.org.noPermission')}
          </p>
        </div>
      ) : grants.isPending ? (
        <PanelLoadingSkeleton />
      ) : grants.isError ? (
        <ErrorState message={t('grants.org.errorLoad')} onRetry={grants.refetch} />
      ) : filtered.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
            border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
        >
          <Icon name="history" size={28} color="var(--cv-t3)" />
          <p className="text-[12px] font-medium text-[var(--cv-t3)]">
            {t('grants.org.empty')}
          </p>
        </div>
      ) : bare ? (
        // Flat grid — no time-bucket headers (inbox Grants segment).
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start gap-[10px]">
          {filtered.map((grant) => (
            <li key={grant.id}>
              <OrgGrantRow
                grant={grant}
                onRevoke={() => setRevokeTarget(grant)}
                onRegrant={() => setRegrantTarget(grant)}
                disabled={revoke.isPending || regrant.isPending}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([bucket, rows]) => (
            <div key={bucket}>
              {/* "Today" gets no header (it's obvious the newest are today). */}
              {bucket !== 'today' && (
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--cv-t3)]">
                  {t(`grants.org.group.${bucket}`)}
                </p>
              )}
              {/* Responsive grid — one column in a narrow split, multiple
                  columns when the panel is wide, so cards stay compact instead
                  of stretching full-width. items-start keeps each card at its
                  natural height. */}
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start gap-[10px]">
                {rows.map((grant) => (
                  <li key={grant.id}>
                    <OrgGrantRow
                      grant={grant}
                      onRevoke={() => setRevokeTarget(grant)}
                      onRegrant={() => setRegrantTarget(grant)}
                      disabled={revoke.isPending || regrant.isPending}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <RevokeGrantDialog
        open={revokeTarget !== null}
        targetLabel={revokeTarget?.entryLabel ?? t('grants.unknownTarget')}
        isPending={revoke.isPending}
        onConfirm={(reason) => revokeTarget && handleRevoke(revokeTarget, reason)}
        onCancel={() => setRevokeTarget(null)}
      />

      {regrantTarget && (
        <GrantAgainDialog
          grant={regrantTarget}
          isPending={regrant.isPending}
          onConfirm={(policy) => handleRegrant(regrantTarget, policy)}
          onCancel={() => setRegrantTarget(null)}
        />
      )}
    </>
  )
}

/** Multi-select status dropdown (sits to the right of the search bar). */
function StatusFilterDropdown({
  selected,
  onChange,
}: {
  selected: Set<GrantStatus>
  onChange: (next: Set<GrantStatus>) => void
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

  function toggle(status: GrantStatus) {
    const next = new Set(selected)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    onChange(next)
  }

  const label =
    selected.size === 0
      ? t('grants.org.filterStatus')
      : t('grants.org.filterStatusCount', { count: selected.size })

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
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border
            border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1 shadow-xl"
          role="listbox"
          aria-multiselectable
        >
          {PANEL_STATUSES.map((s) => {
            const checked = selected.has(s)
            const presentation = grantStatusPresentation(s)
            return (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(s)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]
                  text-[var(--cv-t1)] transition-colors hover:bg-[var(--cv-bg-subtle)]"
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                  style={{
                    borderColor: checked ? presentation.color : 'var(--cv-input-border)',
                    background: checked ? presentation.color : 'transparent',
                  }}
                >
                  {checked && <Icon name="check" size={11} color="#fff" />}
                </span>
                <span style={{ color: presentation.color }}>●</span>
                {t(presentation.labelKey)}
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
              {t('grants.org.filterClear')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function OrgGrantRow({
  grant,
  onRevoke,
  onRegrant,
  disabled,
}: {
  grant: OrgGrant
  onRevoke: () => void
  onRegrant: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const presentation = grantStatusPresentation(grant.status)
  const entryLabel = grant.entryLabel ?? t('grants.unknownTarget')
  const vaultName = grant.vaultName ?? t('grants.unknownTarget')
  const isFull = grant.type === GRANT_TYPE_FULL
  const agentName = grant.agentName ?? t('grants.unknownAgent')
  const actor = grantActorName(grant) ?? t('grants.org.actorSystem')
  const reason = contextualReason(grant, t)
  const accessText = accessSummary(grant, t)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
      {/* Agent section — compact single row: real avatar + name + a small
          self-contained status pill + relative time. The pill keeps the status
          colour contained so the card doesn't flood with colour. */}
      <div className="flex items-center gap-2 px-[14px] py-2.5">
        <AgentAvatar
          agent={{ name: agentName, agentId: grant.agentId ?? '', iconKey: grant.agentIconKey ?? null }}
          size={28}
        />
        <p
          className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--cv-t1)]"
          title={`${t('grants.pending.grantIdLabel')}: ${grant.id}`}
        >
          {agentName}
        </p>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ color: presentation.color, background: presentation.bg }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: presentation.color }}
            aria-hidden
          />
          {t(presentation.labelKey)}
        </span>
        <span
          className="shrink-0 text-[10px] text-[var(--cv-t3)]"
          title={formatGrantDate(grant.createdAt)}
        >
          {formatRelativeTime(grant.createdAt, t)}
        </span>
      </div>

      {/* Detail rows — ALWAYS exactly 4 (Entry / By / Access / contextual
          Reason) so every card is the same height in the grid. Each value is
          single-line truncated with a hover tooltip showing the full content
          (e.g. a long Access reason). */}
      <div className="flex flex-col gap-2 border-t border-[var(--cv-divider)] px-[14px] py-3 text-[11px]">
        {isFull ? (
          // FULL grant covers the whole vault — show "Vault", not a (missing) entry.
          <Row label={t('grants.org.rowVault')} tooltip={vaultName}>
            <Link
              to="/vaults/$vaultId"
              params={{ vaultId: grant.vaultId }}
              className="font-medium text-[var(--cv-t1)] underline-offset-2
                transition-colors hover:text-[var(--cv-primary)] hover:underline"
            >
              {vaultName}
            </Link>
          </Row>
        ) : (
          <Row
            label={t('grants.org.rowEntry')}
            tooltip={grant.vaultName ? `${entryLabel} · ${grant.vaultName}` : entryLabel}
          >
            {grant.entryId ? (
              <Link
                to="/vaults/$vaultId/entries/$entryId"
                params={{ vaultId: grant.vaultId, entryId: grant.entryId }}
                className="font-medium text-[var(--cv-t1)] underline-offset-2
                  transition-colors hover:text-[var(--cv-primary)] hover:underline"
              >
                {entryLabel}
              </Link>
            ) : (
              <span className="font-medium text-[var(--cv-t1)]">{entryLabel}</span>
            )}
            {grant.vaultName && (
              <span className="text-[var(--cv-t3)]"> · {grant.vaultName}</span>
            )}
          </Row>
        )}
        <Row label={t('grants.org.rowActor')} tooltip={actor}>
          {actor}
        </Row>
        <Row label={t('grants.org.rowAccess')} tooltip={accessText}>
          {accessText}
        </Row>
        <Row label={reason.label} tooltip={reason.text}>
          {reason.text}
        </Row>
      </div>

      {(grant.canRevoke || grant.canGrantAgain) && (
        <div
          className="flex min-h-[46px] items-center gap-2 border-t border-[var(--cv-divider)] px-[14px] py-2
            bg-[var(--cv-card-footer)]"
        >
          {grant.canRevoke && (
            <Button
              variant="danger"
              size="sm"
              onClick={onRevoke}
              disabled={disabled}
              className="flex-1"
            >
              {t('grants.revoke.action')}
            </Button>
          )}
          {grant.canGrantAgain && (
            <Button
              variant="positive"
              size="sm"
              onClick={onRegrant}
              disabled={disabled}
              className="flex-1"
            >
              {t('grants.regrant.action')}
            </Button>
          )}
        </div>
      )}

      {/* Terminal grant with no available action means the agent already has
          active coverage of this entry/vault (backend: canGrantAgain=false &&
          canRevoke=false). Surface WHY re-granting is unavailable instead of an
          empty footer — centred, same height as the action footer. */}
      {isTerminal(grant.status) && !grant.canGrantAgain && !grant.canRevoke && (
        <div
          className="flex min-h-[46px] items-center justify-center gap-1.5 border-t border-[var(--cv-divider)]
            px-[14px] py-2 bg-[var(--cv-card-footer)]"
          title={t('grants.org.alreadyActiveHint')}
        >
          <Icon name="check_circle" size={14} color="#10B981" />
          <span className="text-[11px] font-semibold text-[#10B981]">
            {t('grants.org.alreadyActive')}
          </span>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  tooltip,
  children,
}: {
  label: string
  tooltip?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3 leading-relaxed">
      <span className="w-20 shrink-0 font-medium text-[var(--cv-t3)]">{label}</span>
      <Tooltip content={tooltip ?? ''} className="min-w-0 flex-1 truncate text-[var(--cv-t2)]">
        {children}
      </Tooltip>
    </div>
  )
}

function PanelLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[140px] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
      ))}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────

type TFn = ReturnType<typeof useTranslation>['t']

/** A grant in a finished state (not active, not awaiting a decision). */
function isTerminal(status: GrantStatus): boolean {
  return status !== 'active' && status !== 'pending'
}

function accessSummary(grant: OrgGrant, t: TFn): string {
  const kind = accessLimitKind(grant)
  if (kind === 'uses') {
    const left = Math.max((grant.queryLimit ?? 0) - (grant.queryCount ?? 0), 0)
    return t('grants.org.usesLeft', { left, limit: grant.queryLimit ?? 0 })
  }
  if (kind === 'time' && grant.expiresAt) {
    return formatExpiresIn(grant.expiresAt, t)
  }
  return t('grants.org.unlimited')
}

/**
 * The single reason row shown on every card, contextual to the grant's state:
 * denied → deny reason, revoked → revoke reason, otherwise the agent's access
 * (request) reason. Falls back to the access-reason label with an em dash when
 * no reason is present, so the row is always rendered (keeps cards equal).
 */
function contextualReason(grant: OrgGrant, t: TFn): { label: string; text: string } {
  if (grant.status === 'denied' && grant.denyReason) {
    return { label: t('grants.org.rowDenyReason'), text: grant.denyReason }
  }
  if (grant.status === 'revoked' && grant.revokeReason) {
    return { label: t('grants.org.rowRevokeReason'), text: grant.revokeReason }
  }
  return { label: t('grants.org.rowReason'), text: grant.reason ?? '—' }
}

function summarise(items: OrgGrant[]): string | null {
  if (items.length === 0) return null
  const counts: Partial<Record<GrantStatus, number>> = {}
  for (const g of items) counts[g.status] = (counts[g.status] ?? 0) + 1
  const order: GrantStatus[] = ['active', 'expired', 'consumed', 'denied', 'revoked']
  return order
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(' · ')
}

function groupByTime(items: OrgGrant[]): [TimeBucket, OrgGrant[]][] {
  const buckets: Record<TimeBucket, OrgGrant[]> = { today: [], week: [], older: [] }
  for (const g of items) buckets[timeBucket(g.createdAt)].push(g)
  const order: TimeBucket[] = ['today', 'week', 'older']
  return order.filter((b) => buckets[b].length > 0).map((b) => [b, buckets[b]])
}
