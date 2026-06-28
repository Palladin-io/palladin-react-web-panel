import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Icon } from '../../../shared/components/icon'
import type { AuditLogItem } from '../api/audit-api'
import { auditEventConfig } from './audit-event-config'

export interface AuditLogEntryProps {
  item: AuditLogItem
  /** Agent display name resolved by the caller (backend audit rows carry only the id). */
  agentName?: string
  /** Vault display name resolved by the caller — drives the vault chip. */
  vaultName?: string
  /** Show the entry chip — off on the Entry Logs tab where the entry is fixed. */
  showEntry?: boolean
  /** Show the vault chip — on only in the global log; off where the vault is implicit. */
  showVault?: boolean
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
  vaultName,
  showEntry = true,
  showVault = false,
  withDivider = false,
}: AuditLogEntryProps) {
  const { t } = useTranslation()
  const cfg = auditEventConfig(item.eventType)
  // Sentence slots. Names are never a raw id/public key — they fall back to a
  // localised "unknown"/"unnamed". `agent` is the caller-resolved agent (the
  // actor for grant/credential, the target for agent lifecycle); `actor` is the
  // human who performed the action; `object` is the named resource the action
  // targets (vault/entry/org/api-key).
  const slots: SentenceSlots = {
    agent: agentName ?? item.agentName ?? t('audit.unknownAgent'),
    actor: item.actorName ?? item.agentName ?? t('audit.unknownUser'),
    entry: item.entryLabel ?? t('audit.unknownEntry'),
    object: resolveObject(item, t),
  }

  const primary = buildPrimary(item.eventType, t, slots)
  const chips = buildChips(item, t, cfg.labelKey, cfg.color, cfg.bg, cfg.border, {
    showEntry,
    vaultName: showVault ? vaultName : undefined,
  })

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-3.5 ${
        withDivider ? 'border-t border-[var(--cv-divider)]' : ''
      }`}
      style={{ borderLeft: `3px solid ${cfg.color}` }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
      >
        <Icon name={cfg.icon} size={16} style={{ color: cfg.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="min-w-0 text-[12px] font-normal leading-snug text-[var(--cv-t2)]">
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
  options: { showEntry: boolean; vaultName?: string },
): Chip[] {
  const chips: Chip[] = [
    { text: t(typeLabelKey), color: typeColor, bg: typeBg, border: typeBorder },
  ]

  if (options.showEntry && item.entryLabel) {
    chips.push({ icon: 'article', text: item.entryLabel, ...CHIP_STYLES.indigo })
  }

  // Vault chip — only in the global log, where rows span vaults; resolved name
  // passed by the caller, skipped when unknown (never a raw id).
  if (options.vaultName && item.vaultId) {
    chips.push({ icon: 'shield', text: options.vaultName, ...CHIP_STYLES.blue })
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

interface SentenceSlots {
  /** Who performed the action (human, or the agent for agent-initiated events). */
  actor: string
  /** The agent involved — its own action (grant/credential) or the target (lifecycle). */
  agent: string
  /** Entry label (grant/credential sentences). */
  entry: string
  /** Named resource the action targets: vault / entry / org / api-key. */
  object: string
}

/** Resolve the "what" of an event to a display name, never an id. Backend
 *  denormalises: entry → `entryLabel`, vault/org → `metadata.name`,
 *  api-key → `metadata.keyName`; otherwise a localised "unnamed". */
function resolveObject(item: AuditLogItem, t: TFunction): string {
  return (
    item.entryLabel ??
    item.metadata.name ??
    item.metadata.keyName ??
    t('audit.object.unnamed')
  )
}

// Private-use sentinels injected in place of the interpolation values, so the
// translated sentence can be split back into text + name segments without
// re-parsing the i18n template — the names render bold, the rest stays normal.
const ACTOR_TOKEN = String.fromCharCode(0xe000)
const AGENT_TOKEN = String.fromCharCode(0xe001)
const ENTRY_TOKEN = String.fromCharCode(0xe002)
const OBJECT_TOKEN = String.fromCharCode(0xe003)
const TOKEN_SPLITTER = new RegExp(
  `([${ACTOR_TOKEN}${AGENT_TOKEN}${ENTRY_TOKEN}${OBJECT_TOKEN}])`,
)

function buildPrimary(
  eventType: string,
  t: TFunction,
  slots: SentenceSlots,
): ReactNode {
  const key = `audit.sentence.${SENTENCE_KEY[eventType] ?? 'unknown'}`
  const template = t(key, {
    actor: ACTOR_TOKEN,
    agent: AGENT_TOKEN,
    entry: ENTRY_TOKEN,
    object: OBJECT_TOKEN,
    defaultValue: t(auditEventConfig(eventType).labelKey),
  })
  const byToken: Record<string, string> = {
    [ACTOR_TOKEN]: slots.actor,
    [AGENT_TOKEN]: slots.agent,
    [ENTRY_TOKEN]: slots.entry,
    [OBJECT_TOKEN]: slots.object,
  }
  return template.split(TOKEN_SPLITTER).map((part, i) => {
    if (part in byToken) return <Name key={i}>{byToken[part]}</Name>
    if (!part) return null
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Bold, high-contrast emphasis for the actor/asset names inside a sentence. */
function Name({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[var(--cv-t1)]">{children}</span>
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
  'apikey.created': 'apikeyCreated',
  'apikey.activated': 'apikeyActivated',
  'apikey.revoked': 'apikeyRevoked',
  'apikey.deleted': 'apikeyDeleted',
  'org.created': 'orgCreated',
  'org.updated': 'orgUpdated',
  'user.signed-up': 'userSignedUp',
  'account.setup-completed': 'accountSetupCompleted',
  'account.recovery-completed': 'accountRecoveryCompleted',
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
