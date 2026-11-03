import type { Agent } from '../agents'
import type { DecryptedMemberVault } from '../vaults/sync/member-sync-store'
import type { NotificationItem } from './notifications-api'
import type { NotificationPayload } from './notification-types'

/** Structural submission row from the authorized submissions list. */
export interface SubmissionResolutionSource {
  agentId: string
  agentName: string
  submissionKind: number
  entryType: number
}

interface ResolutionSources {
  vaults: ReadonlyMap<string, DecryptedMemberVault>
  agents: ReadonlyMap<string, Agent>
  submissions?: ReadonlyMap<string, SubmissionResolutionSource>
}

function resolvedMetadata(
  metadata: Record<string, string>,
  sources: ResolutionSources,
  type: string,
): Record<string, string> {
  const next = { ...metadata }
  const submission = metadata.submissionId ? sources.submissions?.get(metadata.submissionId) : undefined
  if (submission) {
    next.agentId ??= submission.agentId
    next.submissionKind = String(submission.submissionKind)
    next.submissionEntryType = String(submission.entryType)
  }
  const vault = metadata.vaultId ? sources.vaults.get(metadata.vaultId) : undefined
  const entry = metadata.entryId ? vault?.entries.get(metadata.entryId) : undefined
  const agent = next.agentId ? sources.agents.get(next.agentId) : undefined

  if (vault?.metadata?.name) next.vaultName = vault.metadata.name
  if (entry && !entry.corrupt && entry.payload?.memberLabel) next.entryLabel = entry.payload.memberLabel
  if (agent?.name) next.agentName = agent.name
  else if (submission?.agentName) next.agentName = submission.agentName
  if (agent?.type) next.agentType = agent.type
  if (agent?.publicKeyPrefix && agent.publicKeySuffix) {
    next.agentPublicKeyHint = `${agent.publicKeyPrefix}…${agent.publicKeySuffix}`
  }
  if (agent?.lastHostname) next.host = agent.lastHostname
  if (agent?.lastIp) next.ip = agent.lastIp
  if (agent?.iconKey) next.agentIconKey = agent.iconKey
  if (type === 'agent_approved' && agent?.enrolledByName) next.actorName = agent.enrolledByName
  return next
}

export function resolveNotificationItem(
  item: NotificationItem,
  sources: ResolutionSources,
): NotificationItem {
  return { ...item, metadata: resolvedMetadata(item.metadata ?? {}, sources, item.type) }
}

export function resolveNotificationPayload(
  payload: NotificationPayload,
  sources: ResolutionSources,
): NotificationPayload {
  return { ...payload, data: resolvedMetadata(payload.data, sources, payload.type) }
}

/** Toast "Open" target: a pending submission opens its decision view, everything else the Inbox. */
export function notificationOpenTarget(payload: NotificationPayload):
  | { to: '/submissions/$submissionId'; params: { submissionId: string } }
  | { to: '/inbox' } {
  if (payload.type === 'submission_pending') {
    const submissionId = payload.data.submissionId ?? payload.subjectId
    return { to: '/submissions/$submissionId', params: { submissionId } }
  }
  return { to: '/inbox' }
}

export function notificationDeepLink(item: NotificationItem):
  | { to: '/vaults/$vaultId/grants/$grantId'; params: { vaultId: string; grantId: string } }
  | { to: '/agents/$agentId'; params: { agentId: string } }
  | { to: '/vaults/$vaultId'; params: { vaultId: string }; search?: { tab: 'agents' } }
  | { to: '/vaults/$vaultId/entries/$entryId'; params: { vaultId: string; entryId: string }; search?: { tab: 'sharing' } }
  | { to: '/submissions/$submissionId'; params: { submissionId: string } }
  | null {
  const { agentId, vaultId, entryId, grantId, submissionId } = item.metadata ?? {}
  if (item.type === 'submission_pending') {
    return submissionId ? { to: '/submissions/$submissionId', params: { submissionId } } : null
  }
  if (item.type === 'submission_resolved') return null
  if (item.type === 'entry_share_received') {
    return vaultId && entryId
      ? { to: '/vaults/$vaultId/entries/$entryId', params: { vaultId, entryId }, search: { tab: 'sharing' } }
      : null
  }
  if (item.type.startsWith('agent_') && agentId) {
    return { to: '/agents/$agentId', params: { agentId } }
  }
  if (item.type.startsWith('grant_') && vaultId && grantId) {
    return { to: '/vaults/$vaultId/grants/$grantId', params: { vaultId, grantId } }
  }
  if (item.type.startsWith('grant_') && vaultId) {
    return { to: '/vaults/$vaultId', params: { vaultId }, search: { tab: 'agents' } }
  }
  if (vaultId && entryId) {
    return { to: '/vaults/$vaultId/entries/$entryId', params: { vaultId, entryId } }
  }
  return null
}
