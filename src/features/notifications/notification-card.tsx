import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentAvatar } from '../agents/components/agent-avatar'
import { Icon } from '../../shared/components/icon'
import { Tooltip } from '../../shared/components/tooltip'
import { formatGrantDate, formatRelativeTime } from '../grants/components/grant-format'
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
}

/**
 * One Notification Center card in the grant-card style (anatomy from
 * org-grants-panel / pending-grants-panel): header = avatar + name + subtitle +
 * optional status pill + relative time; detail rows = label column + value;
 * footer = caller-provided actions on a subtle ground.
 *
 * Unread items carry a left accent + a corner dot. All copy is localised on the
 * client from `titleKey`/`metadata`; this component renders only the resolved
 * presentation, so it stays trivial to test.
 */
export function NotificationCard({ item, footer }: NotificationCardProps) {
  const { t } = useTranslation()
  const card = notificationCardPresentation(item)
  const unread = !item.readAt

  return (
    <article
      className="overflow-hidden rounded-xl border bg-[var(--cv-card-bg)]"
      style={{
        borderColor: unread ? 'rgba(255,79,79,0.28)' : 'var(--cv-border)',
      }}
      aria-label={t(card.subtitleKey)}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-[14px] py-2.5">
        <CardAvatar header={card.header} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">
            {card.name}
          </p>
          <p className="truncate text-[11px] text-[var(--cv-t3)]">
            {t(card.subtitleKey)}
          </p>
        </div>
        {card.pill && <Pill pill={card.pill} />}
        <span
          className="shrink-0 whitespace-nowrap text-[10px] text-[var(--cv-t3)]"
          title={formatGrantDate(item.occurredAt)}
        >
          {formatRelativeTime(item.occurredAt, t)}
        </span>
        {unread && (
          <span
            className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-[#FF4F4F]"
            aria-label={t('notifications.center.unread')}
          />
        )}
      </div>

      {/* Detail rows */}
      {card.rows.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[var(--cv-divider)] px-[14px] py-3">
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
  if (header.kind === 'agent') {
    return (
      <AgentAvatar
        agent={{ name: header.agentName ?? '', agentId: '', iconKey: header.agentIconKey }}
        size={30}
      />
    )
  }
  const tone = GLYPH_TONE[header.tone]
  return (
    <span
      aria-hidden
      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
      style={{ background: tone.bg }}
    >
      <Icon name={header.glyph} size={16} color={tone.color} />
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
