import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentAvatar, useAgents } from '../agents'
import { Icon } from '../../shared/components/icon'
import { Tooltip } from '../../shared/components/tooltip'
import { formatGrantDate, formatRelativeTime } from '../grants'
import type { NotificationItem } from './notifications-api'
import {
  notificationCardPresentation,
  type CardHeaderIcon,
  type DetailRowValue,
} from './notification-presentation'

/** Soft chip tints for the glyph header avatar. On-palette tokens only. */
const GLYPH_TONE: Record<'red' | 'amber' | 'teal' | 'grey', { bg: string; color: string }> = {
  red: { bg: 'rgb(var(--cv-primary-rgb) / 0.13)', color: 'var(--cv-primary)' },
  // Amber matches the grant "pending/denied" family (org-grant-presentation).
  amber: { bg: 'rgba(240,192,64,0.14)', color: '#D4820A' },
  teal: { bg: 'rgba(46,196,182,0.14)', color: '#2EC4B6' },
  grey: { bg: 'rgba(138,149,166,0.16)', color: '#8A95A6' },
}

export interface NotificationCardProps {
  item: NotificationItem
  /** Card footer — action buttons (provided by the page) or a terminal note. */
  footer?: ReactNode
  /**
   * Called once when an UNREAD card has been visible long enough to count as
   * "seen" (mark-read-on-view). The page wires this to `markRead(id)` so the
   * unread badge drops while scrolling/reading — including History items that
   * have no explicit action. Read cards never call it.
   */
  onSeen?: (id: string) => void
}

/** How long an unread card must stay visible before it counts as seen. */
const SEEN_DELAY_MS = 600

/**
 * One Notification Center card in the grant-card style (anatomy from
 * org-grants-panel / pending-grants-panel): header = avatar + name + subtitle +
 * relative time; detail rows = label column + value; footer = caller-provided
 * action (inline approve/deny for pending items, otherwise a single "View" link).
 *
 * The card is an IMMUTABLE LOG of an event — it carries no live status pill that
 * would assert the resource's current state; the title + copy describe what
 * happened, not what is true now.
 *
 * Cards are a uniform full-height flex column (the grid stretches them) so every
 * card in a row lines up regardless of how many detail rows it has — the footer
 * pins to the bottom. No per-type accent border or unread dot: a single
 * `--cv-border` + `--cv-card-bg` keeps the grid visually even. All copy is
 * localised on the client from `titleKey`/`metadata`.
 */
export function NotificationCard({ item, footer, onSeen }: NotificationCardProps) {
  const { t } = useTranslation()
  const card = notificationCardPresentation(item)

  // Title = localized type name. Subtitle = agent (or localized fallback) +
  // context, interpolated into the per-type subtitle string.
  const title = t(card.titleKey)
  const agent = card.subtitleAgent || t(card.subtitleAgentFallbackKey)
  const subtitle = t(card.subtitleKey, { agent })

  // Mark-read-on-view: when an unread card stays visible for SEEN_DELAY_MS, fire
  // `onSeen(id)` exactly once. Read cards (or no handler) skip the observer; a
  // per-instance `firedRef` guarantees a single call even before the optimistic
  // `readAt` patch propagates back as a re-render.
  const articleRef = useRef<HTMLElement>(null)
  const firedRef = useRef(false)
  const unread = !item.readAt
  useEffect(() => {
    if (!unread || !onSeen || firedRef.current) return
    const el = articleRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting
        if (visible && timer === null) {
          timer = setTimeout(() => {
            if (!firedRef.current) {
              firedRef.current = true
              onSeen(item.id)
            }
            observer.disconnect()
          }, SEEN_DELAY_MS)
        } else if (!visible && timer !== null) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => {
      if (timer !== null) clearTimeout(timer)
      observer.disconnect()
    }
  }, [unread, onSeen, item.id])

  return (
    <article
      ref={articleRef}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]"
      aria-label={title}
    >
      {/* Header — relative time sits top-right on the title line. */}
      <div className="flex items-start gap-2.5 px-[14px] py-2.5">
        <CardAvatar header={card.header} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">
            {title}
          </p>
          <p className="truncate text-[11px] text-[var(--cv-t3)]">
            {subtitle}
          </p>
        </div>
        <span
          className="shrink-0 whitespace-nowrap text-[10px] text-[var(--cv-t3)]"
          title={formatGrantDate(item.occurredAt)}
        >
          {formatRelativeTime(item.occurredAt, t)}
        </span>
      </div>

      {/* Detail rows — grow to fill so the footer pins to the card bottom */}
      {card.rows.length > 0 && (
        <div className="flex flex-1 flex-col gap-2 border-t border-[var(--cv-divider)] px-[14px] py-3">
          {card.rows.map((row) => (
            <div key={row.labelKey} className="flex gap-3 text-[11px] leading-relaxed">
              <span className="w-20 shrink-0 font-medium text-[var(--cv-t3)]">
                {t(row.labelKey)}
              </span>
              <span className="min-w-0 flex-1 text-[var(--cv-t2)]">
                <RowValue value={row.value} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="flex min-h-[46px] items-center gap-2 border-t border-[var(--cv-divider)] bg-[rgba(14, 16, 18,0.015)] px-[14px] py-2 dark:bg-[rgba(253,249,228,0.02)]">
          {footer}
        </div>
      )}
    </article>
  )
}

function RowValue({ value }: { value: DetailRowValue }) {
  if (value.kind === 'entry') {
    return (
      <span className="block truncate">
        <span className="font-semibold text-[var(--cv-t1)]">{value.entry}</span>
        {value.vault ? <span> · {value.vault}</span> : null}
      </span>
    )
  }

  return (
    <Tooltip content={value.text} className="block truncate">
      {value.text}
    </Tooltip>
  )
}

function CardAvatar({ header }: { header: CardHeaderIcon }) {
  // 36px matches the app's standard icon-circle / agent-list avatar size.
  // Only the agent variant subscribes to the live agent cache; glyph cards must
  // not pull `useAgents()` (no cache read, no needless re-renders).
  if (header.kind === 'agent') {
    return <AgentCardAvatar header={header} />
  }
  const tone = GLYPH_TONE[header.tone]
  return (
    <span
      aria-hidden
      className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px]"
      style={{ background: tone.bg }}
    >
      <Icon name={header.glyph} size={18} color={tone.color} />
    </span>
  )
}

function AgentCardAvatar({ header }: { header: Extract<CardHeaderIcon, { kind: 'agent' }> }) {
  // Resolve the agent's CURRENT icon/name by agentId from the live cache — the
  // notification metadata is an immutable snapshot, so its iconKey goes stale
  // after the owner changes the agent's icon. Fall back to the snapshot when the
  // agent isn't in the cache (no AgentManage permission / not loaded yet).
  const agents = useAgents()
  const live = agents.data?.find((a) => a.agentId === header.agentId)
  return (
    <AgentAvatar
      agent={{
        name: live?.name ?? header.agentName ?? '',
        // Real agentId → deterministic colour matches the Agents list.
        agentId: header.agentId ?? '',
        iconKey: live ? live.iconKey : header.agentIconKey,
      }}
      size={36}
    />
  )
}
