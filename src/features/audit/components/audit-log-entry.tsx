import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Icon } from '../../../shared/components/icon'
import { shortenKey } from '../../../shared/lib/shorten-key'
import type { AuditLogItem } from '../api/audit-api'
import { auditEventConfig } from './audit-event-config'

export interface AuditLogEntryProps {
  item: AuditLogItem
  /** Agent display name resolved by the caller (backend audit rows carry only the id). */
  agentName?: string
  /** Human/system actor resolved from local structural state. */
  actorName?: string
  /** Entry display label resolved from the unlocked client-side member index. */
  entryName?: string
  /** Vault display name resolved by the caller — drives the vault chip. */
  vaultName?: string
  /** Show the entry chip — off on the Entry Logs tab where the entry is fixed. */
  showEntry?: boolean
  /** Show the vault chip — on only in the global log; off where the vault is implicit. */
  showVault?: boolean
  /** Hairline divider above the row (every row except the first in a list). */
  withDivider?: boolean
  /** Transitional legacy fallback; opaque canonical surfaces disable it. */
  allowDenormalizedNames?: boolean
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
  actorName,
  entryName,
  vaultName,
  showEntry = true,
  showVault = false,
  withDivider = false,
  allowDenormalizedNames = false,
}: AuditLogEntryProps) {
  const { t } = useTranslation()
  const cfg = auditEventConfig(item.eventType)
  const agent = agentName ?? (item.agentId ? shortenKey(item.agentId) : t('audit.unknownAgent'))
  const entry = entryName ?? (item.entryId ? shortenKey(item.entryId) : t('audit.unknownEntry'))
  // Sentence slots. Names are never a raw id/public key — they fall back to a
  // localised "unknown"/"unnamed". `agent` is the caller-resolved agent (its own
  // action for grant/credential, the target for agent lifecycle); `object` is
  // the named resource the action targets (vault/entry/org/api-key).
  //
  // `actor` (the WHO) is resolved by `actorType`: agent-initiated events use the
  // agent's name; user/system events use `actorName` and NEVER fall back to
  // `agentName` — otherwise "{actor} blocked agent {agent}" would render the
  // blocked agent as its own blocker ("Claude blocked agent Claude").
  const slots: SentenceSlots = {
    agent,
    actor:
      item.actorType === 'externalRecipient'
        ? t('audit.externalRecipient')
        : item.actorType === 'agent'
        ? agent
        : actorName ?? (item.userId ? shortenKey(item.userId) : t('audit.unknownUser')),
    entry,
    object: resolveObject(
      item,
      t,
      item.entryId ? entry : undefined,
      item.vaultId ? vaultName : undefined,
      allowDenormalizedNames,
    ),
  }

  const primary = buildPrimary(item.eventType, t, slots)
  const chips = buildChips(item, t, cfg.labelKey, cfg.color, cfg.bg, cfg.border, {
    showEntry,
    entryName: entryName ?? (item.entryId ? shortenKey(item.entryId) : undefined),
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
          <p className="min-w-0 text-ui font-normal leading-snug text-[var(--cv-t2)]">
            {primary}
          </p>
          <time
            className="shrink-0 text-micro tabular-nums text-[var(--cv-t3)]"
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
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-micro"
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

// Chip styles emitted by `buildChips`. Colours come from CSS tokens (matching
// the audit `tone()` palette): `blue` = `--cv-info`, `gray` = `--cv-neutral`.
// `indigo` has no semantic token (entry-only accent) so it stays a literal.
const CHIP_STYLES = {
  indigo: { color: '#818CF8', bg: 'rgba(129,140,248,0.10)', border: 'rgba(129,140,248,0.20)' },
  blue: {
    color: 'var(--cv-info)',
    bg: 'rgb(var(--cv-info-rgb) / 0.10)',
    border: 'rgb(var(--cv-info-rgb) / 0.20)',
  },
  gray: {
    color: 'var(--cv-neutral)',
    bg: 'rgb(var(--cv-neutral-rgb) / 0.08)',
    border: 'rgb(var(--cv-neutral-rgb) / 0.18)',
  },
} as const

function buildChips(
  item: AuditLogItem,
  t: TFunction,
  typeLabelKey: string,
  typeColor: string,
  typeBg: string,
  typeBorder: string,
  options: { showEntry: boolean; entryName?: string; vaultName?: string },
): Chip[] {
  const chips: Chip[] = [
    { text: t(typeLabelKey), color: typeColor, bg: typeBg, border: typeBorder },
  ]

  if (options.showEntry && item.entryId && options.entryName) {
    chips.push({ icon: 'article', text: options.entryName, ...CHIP_STYLES.indigo })
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

/** Resolve the event object from caller-provided local names. Legacy metadata
 *  is available only behind an explicit transitional opt-in. */
function resolveObject(
  item: AuditLogItem,
  t: TFunction,
  entryName?: string,
  vaultName?: string,
  allowDenormalizedNames = true,
): string {
  return (
    entryName ??
    vaultName ??
    (item.eventType.startsWith('apikey.') ? item.metadata.keyName : undefined) ??
    (allowDenormalizedNames ? item.metadata.name : undefined) ??
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
  'entry-share.created': 'entryShareCreated',
  'entry-share.delivered': 'entryShareDelivered',
  'entry-share.confirmed': 'entryShareConfirmed',
  'entry-share.protection-changed': 'entryShareProtectionChanged',
  'entry-share.expired': 'entryShareExpired',
  'entry-share.revoked': 'entryShareRevoked',
  'entry-share.ended': 'entryShareEnded',
  'entry-share.source-access-removed': 'entryShareSourceAccessRemoved',
  'auth.login-failed': 'loginFailed',
  'credential.accessed': 'credentialAccessed',
  'credential.access-denied': 'credentialAccessDenied',
  'grant.requested': 'grantRequested',
  'grant.created': 'grantCreated',
  'grant.approved': 'grantApproved',
  'grant.denied': 'grantDenied',
  'grant.revoked': 'grantRevoked',
  'grant.consumed': 'grantConsumed',
  'grant.expired': 'grantExpired',
  'grant.superseded': 'grantSuperseded',
  'agent.enrolled': 'agentEnrolled',
  'agent.blocked': 'agentBlocked',
  'agent.reactivated': 'agentReactivated',
  'agent.deleted': 'agentDeleted',
  'vault.created': 'vaultCreated',
  'vault.updated': 'vaultUpdated',
  'vault.deleted': 'vaultDeleted',
  'vault.exported': 'vaultExported',
  'entry.created': 'entryCreated',
  'entry.updated': 'entryUpdated',
  'entry.deleted': 'entryDeleted',
  'apikey.created': 'apikeyCreated',
  'apikey.activated': 'apikeyActivated',
  'apikey.revoked': 'apikeyRevoked',
  'apikey.deleted': 'apikeyDeleted',
  'org.created': 'orgCreated',
  'org.updated': 'orgUpdated',
  'org.member-invited': 'orgMemberInvited',
  'org.invitation-resent': 'orgInvitationResent',
  'org.invitation-cancelled': 'orgInvitationCancelled',
  'org.invitation-role-changed': 'orgInvitationRoleChanged',
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
