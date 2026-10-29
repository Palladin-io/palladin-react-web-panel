import {
  mergeSubmissionUpdate,
  newEntrySecretFromSubmission,
  type AgentSubmissionPayload,
} from '../../shared/crypto/agent-submission'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { sealEntryShareCopy } from '../../shared/crypto/entry-share-copy-encryption'
import { buildCanonicalGrantEnvelope, listGrantableFields } from '../../shared/crypto/grant-protocol'
import { randomUuid } from '../../shared/crypto/random-uuid'
import { wipe } from '../../shared/crypto/sodium'
import type { MemberSecretV1 } from '../../shared/crypto/vault-plaintext'
import { openVaultProjection } from '../../shared/crypto/vault-protocol'
import { organizationIdFromAccessToken } from '../../shared/lib/organization-scope'
import { useAuthStore } from '../auth'
import { GRANT_METHOD_INJECT, grantMethodsMask, serializeGrantMethods } from '../grants/grant-methods'
import { getCanonicalEntry, issueEntryCreationChallenge } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { prepareCanonicalEntryUpdate } from '../vaults/use-update-canonical-entry'
import {
  approveSubmissionAsNewEntry,
  approveSubmissionAsUpdate,
  type ApproveSubmissionResponse,
  type SubmissionGrantBody,
} from './api/submissions-api'

export class SubmissionApprovalLockedError extends Error {
  constructor() {
    super('Vault lock session changed')
    this.name = 'SubmissionApprovalLockedError'
  }
}

export class SubmissionTargetMismatchError extends Error {
  constructor() {
    super('The Vault or Entry response does not match the signed target and authenticated organization')
    this.name = 'SubmissionTargetMismatchError'
  }
}

export class StaleSubmissionTargetError extends Error {
  constructor() {
    super('The target Entry moved past the submission revision')
    this.name = 'StaleSubmissionTargetError'
  }
}

/** The submitting Agent's current authoritative X25519 recipient key. */
export interface SubmissionGrantRecipient {
  agentId: string
  publicKey: string
  recipientKeyVersion: number
}

const DEFAULT_METHODS = [GRANT_METHOD_INJECT]

async function buildDefaultGrant(
  secret: MemberSecretV1,
  agent: SubmissionGrantRecipient,
  scope: { organizationId: string; vaultId: string; entryId: string; entryRevision: string; memberKeyGeneration: number },
): Promise<SubmissionGrantBody> {
  const grantId = randomUuid()
  const approvedFieldIds = listGrantableFields(secret).map((field) => field.id)
  if (approvedFieldIds.length === 0) throw new Error('The Entry has no grantable field')
  const grantEntry = await buildCanonicalGrantEnvelope({
    secret,
    agentPublicKey: agent.publicKey,
    organizationId: scope.organizationId,
    vaultId: scope.vaultId,
    grantId,
    agentId: agent.agentId,
    entryId: scope.entryId,
    entryRevision: scope.entryRevision,
    grantEnvelopeRevision: '1',
    grantKeyVersion: 1,
    memberKeyGeneration: scope.memberKeyGeneration,
    recipientKeyVersion: agent.recipientKeyVersion,
    approvedMethods: grantMethodsMask(DEFAULT_METHODS),
    approvedFieldIds,
  })
  return {
    grantId,
    vaultId: scope.vaultId,
    entryId: scope.entryId,
    agentId: agent.agentId,
    grantEntry,
    fieldSelectionMode: 'all',
    methods: serializeGrantMethods(DEFAULT_METHODS),
  }
}

/** Independent authority for key use: the JWT organization and principal plus the in-memory Member key. */
function currentAuthority(): { privateKey: Uint8Array; organizationId: string; memberId: string } {
  const { privateKey, accessToken, userId } = useAuthStore.getState()
  const organizationId = organizationIdFromAccessToken(accessToken)
  if (!privateKey || !organizationId || !userId) throw new SubmissionApprovalLockedError()
  return { privateKey, organizationId, memberId: userId }
}

function assertSession(privateKey: Uint8Array): void {
  if (useAuthStore.getState().privateKey !== privateKey) throw new SubmissionApprovalLockedError()
}

export interface ApproveAsNewEntryInput {
  submissionId: string
  vaultId: string
  payload: AgentSubmissionPayload
  label: string
  /** Absent when the approver disabled the default Agent access. */
  agent?: SubmissionGrantRecipient
}

export async function approveAsNewEntry(input: ApproveAsNewEntryInput): Promise<ApproveSubmissionResponse> {
  const { privateKey, organizationId, memberId } = currentAuthority()
  const secret = newEntrySecretFromSubmission(input.payload, input.label)
  const [vault, challenge] = await Promise.all([
    getEncryptedVault(input.vaultId),
    issueEntryCreationChallenge(input.vaultId),
  ])
  // Same binding as saving a shared copy: the Vault response must be the selected Vault in the JWT
  // organization with current key coordinates, and the Member wrapper must address this principal.
  const material = await sealEntryShareCopy(secret, vault,
    { organizationId, memberId, vaultId: input.vaultId, entryId: challenge.entryId }, privateKey, new AbortController().signal)
  const grant = input.agent ? await buildDefaultGrant(secret, input.agent, {
    organizationId, vaultId: input.vaultId, entryId: challenge.entryId, entryRevision: '1',
    memberKeyGeneration: vault.memberKeyGeneration,
  }) : undefined
  assertSession(privateKey)
  return approveSubmissionAsNewEntry(input.submissionId, {
    vaultId: input.vaultId,
    entry: { vaultId: input.vaultId, entryId: challenge.entryId, deliveryPolicy: 'standard', ...material },
    ...(grant ? { grant } : {}),
  })
}

export interface ApproveAsUpdateInput {
  submissionId: string
  vaultId: string
  entryId: string
  expectedEntryRevision: string
  payload: AgentSubmissionPayload
  label?: string
  agent?: SubmissionGrantRecipient
}

export async function approveAsUpdate(input: ApproveAsUpdateInput): Promise<ApproveSubmissionResponse> {
  const { privateKey, organizationId, memberId } = currentAuthority()
  const [detail, vault] = await Promise.all([
    getCanonicalEntry(input.vaultId, input.entryId),
    getEncryptedVault(input.vaultId),
  ])
  // The signed target and the JWT organization are the authority; both responses must match them.
  if (detail.organizationId !== organizationId || detail.vaultId !== input.vaultId || detail.id !== input.entryId
    || vault.id !== input.vaultId || vault.organizationId !== organizationId) throw new SubmissionTargetMismatchError()
  // The backend rejects a moved target too; failing here avoids opening keys for a stale revision.
  if (detail.currentRevision !== input.expectedEntryRevision) throw new StaleSubmissionTargetError()
  const { vaultKey } = await openVaultProjection(vault, privateKey, memberId)
  let current: MemberSecretV1
  try {
    current = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
      organizationId, vaultId: input.vaultId, entryId: input.entryId, revision: detail.currentRevision,
    })
  } finally {
    wipe(vaultKey)
  }
  const next = mergeSubmissionUpdate(current, input.payload, input.label)
  const prepared = await prepareCanonicalEntryUpdate(input.vaultId, {
    detail,
    vault,
    previousCanonicalMemberSecret: current,
    nextCanonicalMemberSecret: next,
  }, input.entryId)
  const grant = input.agent ? await buildDefaultGrant(prepared.nextSecret, input.agent, {
    organizationId: detail.organizationId, vaultId: input.vaultId, entryId: input.entryId,
    entryRevision: prepared.nextRevision, memberKeyGeneration: prepared.memberKeyGeneration,
  }) : undefined
  assertSession(privateKey)
  return approveSubmissionAsUpdate(input.submissionId, {
    entry: { vaultId: input.vaultId, entryId: input.entryId, ...prepared.material },
    ...(grant ? { grant } : {}),
  })
}
