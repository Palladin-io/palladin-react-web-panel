/**
 * Bitwise permission flags mirroring the backend `Permission` enum.
 * The auth store exposes a numeric `permissions` value — AND it with
 * these constants to gate UI affordances.
 *
 * Convention: Read{Resource} / Write{Resource} — never per-action flags.
 * Bits 256/512 are reserved for billing plan feature flags.
 */

export const PERMISSION_AGENT_MANAGE = 16
export const PERMISSION_ORGANIZATION_MANAGEMENT = 2
export const PERMISSION_GRANT_MANAGE = 32
export const PERMISSION_AUDIT_VIEW = 128
export const PERMISSION_VAULT_MANAGE = 8
export const PERMISSION_READ_API_KEY = 4096
export const PERMISSION_WRITE_API_KEY = 8192
