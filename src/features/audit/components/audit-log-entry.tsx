import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Icon } from '../../../shared/components/icon'
import type { AuditLogItem } from '../api/audit-api'
import { auditEventConfig } from './audit-event-config'

export interface AuditLogEntryProps {
  item: AuditLogItem
  /** Agent display name resolved by the caller (backend audit rows carry only the id). */
  agentName?: string
  /** Show the entry chip — off on the Entry Logs tab where the entry is fixed. */
  showEntry?: boolean
  /** Hairline divider above the row (every row except the first in a list). */
  withDivider?: boolean
}

/**
 * Unified audit log row (Variant B) — left colour border, event icon tile, a
 * primary sentence with a timestamp, and a wrapping chip row of context. Driven
 * entirely by a backend `AuditLogItem`; the canonical row reused across the
 * Entry Logs tab and (future) Vault/Agent/global audit views, so styling lives
 * here and nowhere else.
 */
export function AuditLogEntry({
  item,
  agentName,
  showEntry = true,
  withDivider = false,
}: AuditLogEntryProps) {
  const { t } = useTranslation()
  const cfg = auditEventConfig(item.eventType)
  const name = agentName ?? item.agentName ?? t('audit.unknownAgent')
  const entry = item.entryLabel ?? t('audit.unknownEntry')

  const primary = buildPrimary(item.eventType, t, name, entry)
  const chips = buildChips(item, t, cfg.labelKey, cfg.color, cfg.bg, cfg.border, showEntry)

  return (
    <div
      className={`flex gap-2.5 px-4 py-3.5 ${
        withDivider ? 'border-t border-[var(--cv-divider)]' : ''
      }`}
      style={{ borderLeft: `3px solid ${cfg.color}` }}
    >
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
      >
        <Icon name={cfg.icon} size={16} style={{ color: cfg.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="min-w-0 text-[12px] font-semibold leading-snug text-[var(--cv-t1)]">
            {primary}
          </p>
          <time
            className="shrink-0 text-[10px] tabular-nums text-[var(--cv-t3)]"
            dateTime={item.createdAt}
            title={formatAbsolute(item.createdAt)}
          >
            {formatAuditTime(item.createdAt)}
          </time>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px]"
              style={{ color: chip.color, background: chip.bg, border: `1px solid ${chip.border}` }}
            >
              {chip.icon ? <Icon name={chip.icon} size={11} /> : null}
              {chip.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

interface Chip {
  icon?: string
  text: string
  color: string
  bg: string
  border: string
}

// Only the chip styles actually emitted by `buildChips` are kept here — the
// brand red lives solely in the `--cv-primary` token, so any future denial chip
// must use `rgb(var(--cv-primary-rgb) / …)`, never a hardcoded hex.
const CHIP_STYLES = {
  indigo: { color: '#818CF8', bg: 'rgba(129,140,248,0.10)', border: 'rgba(129,140,248,0.20)' },
  blue: { color: '#60A5FA', bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.20)' },
  gray: { color: '#8A95A6', bg: 'rgba(138,149,166,0.08)', border: 'rgba(138,149,166,0.18)' },
} as const

function buildChips(
  item: AuditLogItem,
  t: TFunction,
  typeLabelKey: string,
  typeColor: string,
  typeBg: string,
  typeBorder: string,
  showEntry: boolean,
): Chip[] {
  const chips: Chip[] = [
    { text: t(typeLabelKey), color: typeColor, bg: typeBg, border: typeBorder },
  ]

  if (showEntry && item.entryLabel) {
    chips.push({ icon: 'article', text: item.entryLabel, ...CHIP_STYLES.indigo })
  }

  const grantType = item.metadata.grantType?.toLowerCase()
  if (grantType === 'full' || grantType === 'granular') {
    chips.push({
      icon: 'tune',
      text: t(grantType === 'full' ? 'audit.chip.full' : 'audit.chip.granular'),
      ...CHIP_STYLES.gray,
    })
  }

  const method = item.metadata.method
  if (method) {
    chips.push({ icon: 'bolt', text: method, ...CHIP_STYLES.gray })
  }

  if (item.agentReason) {
    chips.push({ icon: 'chat_bubble', text: item.agentReason, ...CHIP_STYLES.blue })
  }

  return chips
}

function buildPrimary(
  eventType: string,
  t: TFunction,
  agent: string,
  entry: string,
): string {
  const key = `audit.sentence.${SENTENCE_KEY[eventType] ?? 'unknown'}`
  return t(key, { agent, entry, defaultValue: t(auditEventConfig(eventType).labelKey) })
}

/** Maps a dotted event type to the camelCase suffix of its sentence i18n key. */
const SENTENCE_KEY: Record<string, string> = {
  'credential.accessed': 'credentialAccessed',
  'credential.access-denied': 'credentialAccessDenied',
  'grant.requested': 'grantRequested',
  'grant.created': 'grantCreated',
  'grant.approved': 'grantApproved',
  'grant.denied': 'grantDenied',
  'grant.revoked': 'grantRevoked',
  'grant.consumed': 'grantConsumed',
  'grant.expired': 'grantExpired',
  'agent.enrolled': 'agentEnrolled',
  'agent.blocked': 'agentBlocked',
  'agent.reactivated': 'agentReactivated',
  'agent.deleted': 'agentDeleted',
  'vault.created': 'vaultCreated',
  'vault.updated': 'vaultUpdated',
  'vault.deleted': 'vaultDeleted',
  'entry.created': 'entryCreated',
  'entry.updated': 'entryUpdated',
  'entry.deleted': 'entryDeleted',
}

function formatAuditTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatAbsolute(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
