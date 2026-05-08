/**
 * Domain types for the Vault feature.
 *
 * Grant modes are stored as numeric enum values to mirror the backend
 * contract — the API serialises C# enums as integers, and we keep the
 * same shape on the wire to avoid lossy string conversions.
 */

export const GRANT_MODE_FULL = 1 as const
export const GRANT_MODE_GRANULAR = 2 as const
export type GrantMode = typeof GRANT_MODE_FULL | typeof GRANT_MODE_GRANULAR

/**
 * Bitwise permission flags from the backend Permission enum. The auth
 * store exposes a numeric `permissions` value — components AND it with
 * these constants to gate Pro-only UI affordances.
 */
export const PERMISSION_MULTIPLE_VAULTS = 256
export const PERMISSION_FULL_GRANT_MODE = 512

export interface VaultSummary {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  grantMode: GrantMode
  createdAt: string
  updatedAt: string
  entryCount: number
  activeGrantCount: number
  memberCount: number
}

export interface Vault extends VaultSummary {
  organizationId: string
}

export interface CreateVaultInput {
  name: string
  description?: string
  icon?: string
  color?: string
  grantMode: GrantMode
}

export interface UpdateVaultInput {
  name?: string
  description?: string
  icon?: string
  color?: string
  grantMode?: GrantMode
}
