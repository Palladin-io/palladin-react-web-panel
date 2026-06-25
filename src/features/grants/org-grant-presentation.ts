import type { GrantStatus, OrgGrant } from './api/org-grants-api'

interface StatusPresentation {
  labelKey: string
  /** Hex colour for the status badge (brand palette). */
  color: string
  /** Soft background tint for the badge chip. */
  bg: string
}

/**
 * Status → badge label/colour. Single source of truth so the list rows and the
 * summary counter stay consistent. Active=green, Pending=amber,
 * Denied/Revoked=red, Expired/Consumed=grey.
 */
const STATUS_PRESENTATION: Record<GrantStatus, StatusPresentation> = {
  active: { labelKey: 'grants.statusActive', color: '#16A34A', bg: 'rgba(22, 163, 74,0.12)' },
  pending: { labelKey: 'grants.statusPending', color: '#D4820A', bg: 'rgba(240,192,64,0.14)' },
  denied: { labelKey: 'grants.statusDenied', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.12)' },
  revoked: { labelKey: 'grants.statusRevoked', color: 'var(--cv-primary)', bg: 'rgb(var(--cv-primary-rgb) / 0.12)' },
  expired: { labelKey: 'grants.statusExpired', color: '#8A95A6', bg: 'rgba(138,149,166,0.14)' },
  consumed: { labelKey: 'grants.statusConsumed', color: '#8A95A6', bg: 'rgba(138,149,166,0.14)' },
}

export function grantStatusPresentation(status: GrantStatus): StatusPresentation {
  return STATUS_PRESENTATION[status]
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
  return grant.createdByName ?? null
}

export type AccessLimitKind = 'uses' | 'time' | 'lifetime'

/** Classify a grant's access policy from its fields. */
export function accessLimitKind(grant: OrgGrant): AccessLimitKind {
  if (grant.queryLimit != null) return 'uses'
  if (grant.expiresAt) return 'time'
  return 'lifetime'
}
