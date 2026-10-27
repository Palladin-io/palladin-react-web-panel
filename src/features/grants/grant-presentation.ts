import type { GrantStatus } from './api/grants-api'

/**
 * Maps a grant status to its i18n label key and a status-dot colour.
 * Single source of truth so the list panel and detail header stay in sync.
 */
interface StatusPresentation {
  labelKey: string
  /** Semantic colour for the status label. */
  color: string
}

const STATUS_PRESENTATION: Partial<Record<GrantStatus, StatusPresentation>> = {
  pending: { labelKey: 'grants.statusPending', color: 'var(--cv-pending)' },
  active: { labelKey: 'grants.statusActive', color: 'var(--cv-success)' },
  expired: { labelKey: 'grants.statusExpired', color: 'var(--cv-neutral)' },
  revoked: { labelKey: 'grants.statusRevoked', color: 'var(--cv-primary)' },
  consumed: { labelKey: 'grants.statusConsumed', color: 'var(--cv-neutral)' },
  denied: { labelKey: 'grants.statusDenied', color: 'var(--cv-primary)' },
  superseded: { labelKey: 'grants.statusSuperseded', color: 'var(--cv-neutral)' },
}

const UNKNOWN_STATUS_PRESENTATION: StatusPresentation = {
  labelKey: 'grants.statusUnknown',
  color: 'var(--cv-neutral)',
}

export function grantStatusPresentation(status: GrantStatus): StatusPresentation {
  return STATUS_PRESENTATION[status] ?? UNKNOWN_STATUS_PRESENTATION
}

/** A grant can be revoked only while it is pending or active. */
export function isRevocable(status: GrantStatus): boolean {
  return status === 'pending' || status === 'active'
}

/** Render an explicit type; never label an unsupported type as GRANULAR. */
export function grantTypeLabelKey(type: string): string {
  if (type === "full") return "grants.modeFull"
  if (type === "granular") return "grants.modeGranular"
  if (type === "scriptExecution") return "grants.modeScriptExecution"
  return "grants.modeUnknown"
}
