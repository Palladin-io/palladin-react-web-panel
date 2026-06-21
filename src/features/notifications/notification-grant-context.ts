import type { NotificationItem } from './notifications-api'

/**
 * Grant identifiers a notification carries in `metadata`, needed to drive the
 * existing zero-knowledge approve/deny/revoke/regrant flows from the Inbox
 * (CVT-164). The crypto hooks own all key handling — this only forwards ids the
 * backend already put in `metadata` (never secrets).
 */
export interface NotificationGrantContext {
  grantId: string
  vaultId: string
  agentId: string | null
  entryId: string | null
  entryLabel: string | null
  agentName: string | null
  vaultName: string | null
  /** base64 X25519 public key — required to seal a DEK on approve/regrant. */
  agentPublicKey: string | null
  /** Combined-flags methods string the agent requested, e.g. "get, inject". */
  methods: string | null
}

/**
 * Extract a grant-action context from a notification's metadata. Returns `null`
 * when the notification is not grant-backed or is missing the two ids every
 * grant action needs (`grantId` + `vaultId`) — the card then renders without
 * action buttons rather than firing a malformed request.
 */
export function notificationGrantContext(
  item: NotificationItem,
): NotificationGrantContext | null {
  const m = item.metadata ?? {}
  const grantId = m.grantId
  const vaultId = m.vaultId
  if (!grantId || !vaultId) return null

  return {
    grantId,
    vaultId,
    agentId: m.agentId ?? null,
    entryId: m.entryId ?? null,
    entryLabel: m.entryLabel ?? null,
    agentName: m.agentName ?? null,
    vaultName: m.vaultName ?? null,
    agentPublicKey: m.agentPublicKey ?? null,
    methods: m.methods ?? null,
  }
}
