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
 * Per-event presentation — single source of truth for the audit row icon,
 * colour and type-chip label. Colours follow the established semantic palette
 * (teal = success/access, brand red = denial/destructive, blue = neutral
 * lifecycle, grey = expiry/passive). The brand red comes only from the
 * `--cv-primary` token (never a hardcoded hex), matching the Astro prototype.
 */
const CONFIG: Record<AuditEventType, AuditEventConfig> = {
  'credential.accessed': { icon: 'key', color: '#2EC4B6', bg: 'rgba(46,196,182,0.12)', border: 'rgba(46,196,182,0.25)', labelKey: 'audit.event.credentialAccessed' },
  'credential.access-denied': { icon: 'key_off', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.10)', border: 'rgb(var(--cv-primary-rgb) / 0.22)', labelKey: 'audit.event.credentialAccessDenied' },
  'grant.requested': { icon: 'hourglass_empty', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', labelKey: 'audit.event.grantRequested' },
  'grant.created': { icon: 'lock_open', color: '#2EC4B6', bg: 'rgba(46,196,182,0.12)', border: 'rgba(46,196,182,0.25)', labelKey: 'audit.event.grantCreated' },
  'grant.approved': { icon: 'check_circle', color: '#2EC4B6', bg: 'rgba(46,196,182,0.12)', border: 'rgba(46,196,182,0.25)', labelKey: 'audit.event.grantApproved' },
  'grant.denied': { icon: 'block', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.10)', border: 'rgb(var(--cv-primary-rgb) / 0.22)', labelKey: 'audit.event.grantDenied' },
  'grant.revoked': { icon: 'remove_circle', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.10)', border: 'rgb(var(--cv-primary-rgb) / 0.22)', labelKey: 'audit.event.grantRevoked' },
  'grant.consumed': { icon: 'task_alt', color: '#8A95A6', bg: 'rgba(138,149,166,0.10)', border: 'rgba(138,149,166,0.22)', labelKey: 'audit.event.grantConsumed' },
  'grant.expired': { icon: 'timer_off', color: '#8A95A6', bg: 'rgba(138,149,166,0.10)', border: 'rgba(138,149,166,0.22)', labelKey: 'audit.event.grantExpired' },
  'agent.enrolled': { icon: 'person_add', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', labelKey: 'audit.event.agentEnrolled' },
  'agent.blocked': { icon: 'person_off', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.10)', border: 'rgb(var(--cv-primary-rgb) / 0.22)', labelKey: 'audit.event.agentBlocked' },
  'agent.reactivated': { icon: 'how_to_reg', color: '#2EC4B6', bg: 'rgba(46,196,182,0.12)', border: 'rgba(46,196,182,0.25)', labelKey: 'audit.event.agentReactivated' },
  'agent.deleted': { icon: 'person_remove', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.10)', border: 'rgb(var(--cv-primary-rgb) / 0.22)', labelKey: 'audit.event.agentDeleted' },
  'vault.created': { icon: 'shield', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', labelKey: 'audit.event.vaultCreated' },
  'vault.updated': { icon: 'edit', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', labelKey: 'audit.event.vaultUpdated' },
  'vault.deleted': { icon: 'delete_forever', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.10)', border: 'rgb(var(--cv-primary-rgb) / 0.22)', labelKey: 'audit.event.vaultDeleted' },
  'entry.created': { icon: 'note_add', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', labelKey: 'audit.event.entryCreated' },
  'entry.updated': { icon: 'edit_note', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', labelKey: 'audit.event.entryUpdated' },
  'entry.deleted': { icon: 'delete', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.10)', border: 'rgb(var(--cv-primary-rgb) / 0.22)', labelKey: 'audit.event.entryDeleted' },
}

const FALLBACK: AuditEventConfig = {
  icon: 'help',
  color: '#8A95A6',
  bg: 'rgba(138,149,166,0.10)',
  border: 'rgba(138,149,166,0.22)',
  labelKey: 'audit.event.unknown',
}

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
