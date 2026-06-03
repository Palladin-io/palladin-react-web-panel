import type { GrantStatus } from './api/grants-api'

/**
 * Maps a grant status to its i18n label key and a status-dot colour.
 * Single source of truth so the list panel and detail header stay in sync.
 */
interface StatusPresentation {
  labelKey: string
  /** Hex colour for the status dot/badge. */
  color: string
}

const STATUS_PRESENTATION: Record<GrantStatus, StatusPresentation> = {
  pending: { labelKey: 'grants.statusPending', color: '#D4820A' },
  active: { labelKey: 'grants.statusActive', color: '#2EC4B6' },
  expired: { labelKey: 'grants.statusExpired', color: '#8A95A6' },
  revoked: { labelKey: 'grants.statusRevoked', color: '#FF4F4F' },
  consumed: { labelKey: 'grants.statusConsumed', color: '#8A95A6' },
  denied: { labelKey: 'grants.statusDenied', color: '#FF4F4F' },
}

export function grantStatusPresentation(status: GrantStatus): StatusPresentation {
  return STATUS_PRESENTATION[status]
}

/** A grant can be revoked only while it is pending or active. */
export function isRevocable(status: GrantStatus): boolean {
  return status === 'pending' || status === 'active'
}
