import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentAvatar } from '../agents/components/agent-avatar'
import { Icon } from '../../shared/components/icon'
import { Tooltip } from '../../shared/components/tooltip'
import {
  formatExpiresIn,
  formatGrantDate,
  formatRelativeTime,
} from '../grants/components/grant-format'
import type { NotificationItem } from './notifications-api'
import {
  notificationCardPresentation,
  type CardHeaderIcon,
  type DetailRowValue,
  type PillTone,
  type StatusPill,
} from './notification-presentation'

/** Soft chip tints for the glyph header avatar. On-palette tokens only. */
const GLYPH_TONE: Record<'red' | 'amber' | 'teal' | 'grey', { bg: string; color: string }> = {
  red: { bg: 'rgba(255,79,79,0.13)', color: '#FF4F4F' },
  // Amber matches the grant "pending/denied" family (org-grant-presentation).
  amber: { bg: 'rgba(240,192,64,0.14)', color: '#D4820A' },
  teal: { bg: 'rgba(46,196,182,0.14)', color: '#2EC4B6' },
  grey: { bg: 'rgba(138,149,166,0.16)', color: '#8A95A6' },
}

const PILL_TONE: Record<PillTone, { color: string; bg: string }> = {
  green: { color: '#2EC4B6', bg: 'rgba(46,196,182,0.13)' },
  red: { color: '#FF4F4F', bg: 'rgba(255,79,79,0.12)' },
  // Denied pill reuses the grant amber tokens (org-grant-presentation pending).
  amber: { color: '#D4820A', bg: 'rgba(240,192,64,0.14)' },
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
 * optional status pill + relative time; detail rows = label column + value;
 * footer = caller-provided actions on a subtle ground.
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
      {/* Header — date sits top-right on the title line; the status pill (if
          any) stacks directly under the date, not inline with the title. */}
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="whitespace-nowrap text-[10px] text-[var(--cv-t3)]"
            title={formatGrantDate(item.occurredAt)}
          >
            {formatRelativeTime(item.occurredAt, t)}
          </span>
          {card.pill && <Pill pill={card.pill} />}
        </div>
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
        <div className="flex min-h-[46px] items-center gap-2 border-t border-[var(--cv-divider)] bg-[rgba(0,11,46,0.015)] px-[14px] py-2 dark:bg-[rgba(253,249,228,0.02)]">
          {footer}
        </div>
      )}
    </article>
  )
}

function RowValue({ value }: { value: DetailRowValue }) {
  const { t } = useTranslation()

  if (value.kind === 'entry') {
    return (
      <span className="block truncate">
        <span className="font-semibold text-[var(--cv-t1)]">{value.entry}</span>
        {value.vault ? <span> · {value.vault}</span> : null}
      </span>
    )
  }

  if (value.kind === 'access') {
    const text = formatAccess(value, t)
    return (
      <Tooltip content={text} className="block truncate">
        {text}
      </Tooltip>
    )
  }

  return (
    <Tooltip content={value.text} className="block truncate">
      {value.text}
    </Tooltip>
  )
}

/**
 * Localizes a grant access policy — mirrors org-grants `accessSummary`:
 * use-capped → "{left}/{limit} uses"; time-limited → "expires in 6d";
 * otherwise → "Unlimited".
 */
function formatAccess(
  value: { queryLimit?: number; queryCount?: number; expiresAt?: string },
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (value.queryLimit != null) {
    const left = Math.max(value.queryLimit - (value.queryCount ?? 0), 0)
    return t('grants.org.usesLeft', { left, limit: value.queryLimit })
  }
  if (value.expiresAt) {
    return formatExpiresIn(value.expiresAt, t)
  }
  return t('grants.org.unlimited')
}

function CardAvatar({ header }: { header: CardHeaderIcon }) {
  // 36px matches the app's standard icon-circle / agent-list avatar size.
  if (header.kind === 'agent') {
    return (
      <AgentAvatar
        agent={{
          name: header.agentName ?? '',
          // Real agentId → deterministic colour matches the Agents list; iconKey
          // → the agent's chosen glyph or uploaded S3 image (when present).
          agentId: header.agentId ?? '',
          iconKey: header.agentIconKey,
        }}
        size={36}
      />
    )
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

function Pill({ pill }: { pill: StatusPill }) {
  const { t } = useTranslation()
  const tone = PILL_TONE[pill.tone]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color: tone.color, background: tone.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
      {t(pill.labelKey)}
    </span>
  )
}
