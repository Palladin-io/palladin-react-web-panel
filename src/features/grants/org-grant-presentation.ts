import type { GrantStatus, OrgGrant } from './api/org-grants-api'

interface StatusPresentation {
  labelKey: string
  /** Semantic token for the status badge. */
  color: string
}

/**
 * Status → badge label/colour. Single source of truth so the list rows and the
 * summary counter stay consistent. Active=green, Pending=amber,
 * Denied/Revoked=red, Expired/Consumed=grey.
 */
const STATUS_PRESENTATION: Partial<Record<GrantStatus, StatusPresentation>> = {
  active: { labelKey: 'grants.statusActive', color: 'var(--cv-success)' },
  pending: { labelKey: 'grants.statusPending', color: 'var(--cv-pending)' },
  denied: { labelKey: 'grants.statusDenied', color: 'var(--cv-primary)' },
  revoked: { labelKey: 'grants.statusRevoked', color: 'var(--cv-primary)' },
  expired: { labelKey: 'grants.statusExpired', color: 'var(--cv-neutral)' },
  consumed: { labelKey: 'grants.statusConsumed', color: 'var(--cv-neutral)' },
  superseded: { labelKey: 'grants.statusSuperseded', color: 'var(--cv-neutral)' },
}

const UNKNOWN_STATUS_PRESENTATION: StatusPresentation = {
  labelKey: 'grants.statusUnknown',
  color: 'var(--cv-neutral)',
}

export function grantStatusPresentation(status: GrantStatus): StatusPresentation {
  return STATUS_PRESENTATION[status] ?? UNKNOWN_STATUS_PRESENTATION
}

// Action availability (canRevoke / canGrantAgain) is computed by the backend
// and read straight off the grant — the UI no longer infers it from status.

/**
 * The actor who last acted on the grant, by status:
 * revoked → revokedByName, denied → deniedByName, else createdByName.
 * Returns `null` when unknown (caller renders a "System"/"—" fallback).
 */
export function grantActorName(grant: OrgGrant): string | null {
  if (grant.status === 'revoked') return grant.revokedByName ?? null
  if (grant.status === 'denied') return grant.deniedByName ?? null
  if (grant.status === 'superseded') return null
  return grant.createdByName ?? null
}

export type AccessLimitKind = 'uses' | 'time' | 'lifetime'

/** Classify a grant's access policy from its fields. */
export function accessLimitKind(grant: OrgGrant): AccessLimitKind {
  if (grant.queryLimit != null) return 'uses'
  if (grant.expiresAt) return 'time'
  return 'lifetime'
}
