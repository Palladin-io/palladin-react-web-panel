export interface GrantReasonCoordinate {
  id: string
  vaultId: string
  entryId?: string | null
  agentId?: string | null
}

/**
 * Keys decrypted reason plaintext by every coordinate authenticated by the
 * envelope. An id-only key could relabel cached plaintext after a stale or
 * compromised first-party response changes one of the remaining coordinates.
 */
export function grantReasonCoordinateKey(
  coordinate: GrantReasonCoordinate,
): string {
  return JSON.stringify([
    coordinate.id,
    coordinate.vaultId,
    coordinate.entryId ?? null,
    coordinate.agentId ?? null,
  ])
}
