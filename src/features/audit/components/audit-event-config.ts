import type { AuditEventType } from '../api/audit-api'

export interface AuditEventConfig {
  /** Material Symbols glyph. */
  icon: string
  /** Accent colour for the icon + left border. */
  color: string
  /** Soft icon-tile background tint. */
  bg: string
  /** Icon-tile border tint. */
  border: string
  /** i18n key for the uppercase type chip label. */
  labelKey: string
}

/**
 * Semantic accent tones — every audit colour comes from a CSS token (never a
 * hardcoded hex), so the palette tracks the design system and matches mobile
 * (`AppColors`): success = `#10B981`, danger = brand red, info = blue,
 * neutral = grey, pending = peach (awaiting human action). Each tone yields the
 * icon colour plus the soft tile bg/border tints.
 */
type Tone = 'success' | 'danger' | 'info' | 'neutral' | 'pending'

function tone(name: Tone, icon: string, labelKey: string): AuditEventConfig {
  const varName = name === 'danger' ? 'primary' : name
  const color = `var(--cv-${varName})`
  const rgb = `var(--cv-${varName}-rgb)`
  return {
    icon,
    color,
    bg: `rgb(${rgb} / 0.12)`,
    border: `rgb(${rgb} / 0.25)`,
    labelKey,
  }
}

/**
 * Per-event presentation — single source of truth for the audit row icon,
 * colour and type-chip label. Tone assignment: success = access granted /
 * positive completion (incl. agent reactivation), danger = denial / destruction,
 * info = neutral lifecycle (created/updated/enrolled), neutral = passive/terminal
 * (consumed/expired), pending = awaiting human action (grant requested — the
 * only pending event, peach, mirrors mobile).
 */
const CONFIG: Record<AuditEventType, AuditEventConfig> = {
  'auth.login-failed': tone('danger', 'gpp_bad', 'audit.event.loginFailed'),
  'credential.accessed': tone('success', 'key', 'audit.event.credentialAccessed'),
  'credential.access-denied': tone('danger', 'key_off', 'audit.event.credentialAccessDenied'),
  'grant.requested': tone('pending', 'hourglass_empty', 'audit.event.grantRequested'),
  'grant.created': tone('success', 'lock_open', 'audit.event.grantCreated'),
  'grant.approved': tone('success', 'check_circle', 'audit.event.grantApproved'),
  'grant.denied': tone('danger', 'block', 'audit.event.grantDenied'),
  'grant.revoked': tone('danger', 'remove_circle', 'audit.event.grantRevoked'),
  'grant.consumed': tone('neutral', 'task_alt', 'audit.event.grantConsumed'),
  'grant.expired': tone('neutral', 'timer_off', 'audit.event.grantExpired'),
  'grant.superseded': tone('neutral', 'swap_horiz', 'audit.event.grantSuperseded'),
  'agent.enrolled': tone('info', 'person_add', 'audit.event.agentEnrolled'),
  'agent.blocked': tone('danger', 'person_off', 'audit.event.agentBlocked'),
  'agent.reactivated': tone('success', 'how_to_reg', 'audit.event.agentReactivated'),
  'agent.deleted': tone('danger', 'person_remove', 'audit.event.agentDeleted'),
  'vault.created': tone('info', 'shield', 'audit.event.vaultCreated'),
  'vault.updated': tone('info', 'edit', 'audit.event.vaultUpdated'),
  'vault.deleted': tone('danger', 'delete_forever', 'audit.event.vaultDeleted'),
  'vault.exported': tone('info', 'file_download', 'audit.event.vaultExported'),
  'entry.created': tone('info', 'note_add', 'audit.event.entryCreated'),
  'entry.updated': tone('info', 'edit_note', 'audit.event.entryUpdated'),
  'entry.deleted': tone('danger', 'delete', 'audit.event.entryDeleted'),
  'apikey.created': tone('info', 'vpn_key', 'audit.event.apikeyCreated'),
  'apikey.activated': tone('success', 'key', 'audit.event.apikeyActivated'),
  'apikey.revoked': tone('danger', 'key_off', 'audit.event.apikeyRevoked'),
  'apikey.deleted': tone('danger', 'delete', 'audit.event.apikeyDeleted'),
  'org.created': tone('info', 'corporate_fare', 'audit.event.orgCreated'),
  'org.updated': tone('info', 'domain', 'audit.event.orgUpdated'),
  'org.member-invited': tone('info', 'forward_to_inbox', 'audit.event.orgMemberInvited'),
  'org.invitation-resent': tone('info', 'outgoing_mail', 'audit.event.orgInvitationResent'),
  'org.invitation-cancelled': tone('danger', 'person_remove', 'audit.event.orgInvitationCancelled'),
  'org.invitation-role-changed': tone('info', 'manage_accounts', 'audit.event.orgInvitationRoleChanged'),
  'user.signed-up': tone('info', 'person_add', 'audit.event.userSignedUp'),
  'account.setup-completed': tone('success', 'verified_user', 'audit.event.accountSetupCompleted'),
  'account.recovery-completed': tone('success', 'lock_reset', 'audit.event.accountRecoveryCompleted'),
}

const FALLBACK: AuditEventConfig = tone('neutral', 'help', 'audit.event.unknown')

export function auditEventConfig(eventType: string): AuditEventConfig {
  return CONFIG[eventType as AuditEventType] ?? FALLBACK
}

/**
 * Event types relevant to a single entry's Logs tab — drives the event-type
 * filter dropdown. Reveal/copy actions happen entirely client-side (the server
 * never sees plaintext) so they are intentionally NOT audited and not listed.
 */
export const ENTRY_RELEVANT_EVENT_TYPES: AuditEventType[] = [
  'entry.created',
  'entry.updated',
  'entry.deleted',
  'credential.accessed',
  'credential.access-denied',
  'grant.created',
  'grant.approved',
  'grant.denied',
  'grant.revoked',
]

export interface AuditEventCategory {
  /** i18n key for the category heading. */
  labelKey: string
  types: AuditEventType[]
}

/**
 * Semantic grouping of every audit event — drives the legend modal so the full
 * taxonomy reads as a handful of categories rather than one long list. Every
 * member of `AUDIT_EVENT_TYPES` appears in exactly one category (asserted by a
 * test) so a newly added event can never silently fall out of the legend.
 */
export const AUDIT_EVENT_CATEGORIES: AuditEventCategory[] = [
  {
    labelKey: 'audit.legend.category.credentialAccess',
    types: ['credential.accessed', 'credential.access-denied'],
  },
  {
    labelKey: 'audit.legend.category.grantLifecycle',
    types: [
      'grant.requested',
      'grant.created',
      'grant.approved',
      'grant.denied',
      'grant.revoked',
      'grant.consumed',
      'grant.expired',
      'grant.superseded',
    ],
  },
  {
    labelKey: 'audit.legend.category.vaultEntry',
    types: [
      'vault.created',
      'vault.updated',
      'vault.deleted',
      'vault.exported',
      'entry.created',
      'entry.updated',
      'entry.deleted',
    ],
  },
  {
    labelKey: 'audit.legend.category.agentLifecycle',
    types: ['agent.enrolled', 'agent.blocked', 'agent.reactivated', 'agent.deleted'],
  },
  {
    labelKey: 'audit.legend.category.apiKeys',
    types: ['apikey.created', 'apikey.activated', 'apikey.revoked', 'apikey.deleted'],
  },
  {
    labelKey: 'audit.legend.category.orgAccount',
    types: [
      'auth.login-failed',
      'org.created',
      'org.updated',
      'org.member-invited',
      'org.invitation-resent',
      'org.invitation-cancelled',
      'org.invitation-role-changed',
      'user.signed-up',
      'account.setup-completed',
      'account.recovery-completed',
    ],
  },
]
