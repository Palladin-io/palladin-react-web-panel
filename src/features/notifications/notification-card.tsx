import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentAvatar } from '../agents'
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
  teal: { bg: 'rgb(var(--cv-success-rgb) / 0.14)', color: 'var(--cv-success)' },
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
  const headerTextFlow = item.type === 'entry_share_received' ? 'break-words' : 'truncate'

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
      <div className="flex items-start gap-2.5 px-[0.875rem] py-2.5">
        <CardAvatar header={card.header} />
        <div className="min-w-0 flex-1">
          <p className={`${headerTextFlow} text-heading-sm font-semibold text-[var(--cv-t1)]`}>
            {title}
          </p>
          <p className={`${headerTextFlow} text-meta text-[var(--cv-t3)]`}>
            {subtitle}
          </p>
        </div>
        <span
          className="shrink-0 whitespace-nowrap text-micro text-[var(--cv-t3)]"
          title={formatGrantDate(item.occurredAt)}
        >
          {formatRelativeTime(item.occurredAt, t)}
        </span>
      </div>

      {/* Detail rows — grow to fill so the footer pins to the card bottom */}
      {card.rows.length > 0 && (
        <div className="flex flex-1 flex-col gap-2 border-t border-[var(--cv-divider)] px-[0.875rem] py-3">
          {card.rows.map((row) => (
            <div key={row.labelKey} className="flex gap-3 text-meta leading-relaxed">
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
        <div className="flex min-h-[2.875rem] items-center gap-2 border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-[0.875rem] py-2">
          {footer}
        </div>
      )}
    </article>
  )
}

function RowValue({ value }: { value: DetailRowValue }) {
  const { t } = useTranslation()
  if (value.kind === 'message') return <span>{t(value.key)}</span>
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
    return (
      <AgentAvatar
        agent={{
          name: header.agentName ?? '',
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
      className="flex h-[2.25rem] w-[2.25rem] shrink-0 items-center justify-center rounded-[0.5625rem]"
      style={{ background: tone.bg }}
    >
      <Icon name={header.glyph} size={18} color={tone.color} />
    </span>
  )
}
