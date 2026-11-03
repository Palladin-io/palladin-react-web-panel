import { api } from '../../../shared/api/client'
import type {
  AgentEntrySubmission,
  ApproverKeyWrap,
  ApproverRecipient,
  OrganizationApproverManifest,
} from '../../../shared/crypto/agent-submission'
import type { CanonicalEntryEnvelopes } from '../../../shared/crypto/entry-protocol'
import type { buildCanonicalGrantEnvelope } from '../../../shared/crypto/grant-protocol'
import type { EntryUpdateMaterial } from '../../vaults/api/vault-api'

export const APPROVER_KEY_STATUS_ABSENT = 'absent'
export const APPROVER_KEY_STATUS_READY = 'ready'
export const APPROVER_KEY_STATUS_UNAVAILABLE = 'unavailable'

export interface ApproverKeysResponse {
  /** `absent`, `ready` or `unavailable`; an unknown value never triggers a key operation. */
  status: string
  keyVersion: number | null
  approverSetRevision: string | null
  manifest: OrganizationApproverManifest | null
  myWraps: ApproverKeyWrap[] | null
  approvers: ApproverRecipient[]
  approverSetDigest: string
  rotationRequired: boolean
}

export interface ApproverKeyChallengeResponse {
  challengeId: string
  issuedAt: string
  approverSetRevision: string
  approverSetDigest: string
  approvers: ApproverRecipient[]
  expiresAt: string
}

export interface ApproverKeySetChangeBody {
  challengeId: string
  manifest: OrganizationApproverManifest
  wraps: ApproverKeyWrap[]
}

export type ApproverKeyChangeRoute = 'bootstrap' | 'add-approvers' | 'rotate' | 'rebootstrap'

export function getApproverKeys(): Promise<ApproverKeysResponse> {
  return api.get('api/approver-keys').json<ApproverKeysResponse>()
}

export function issueApproverKeyChallenge(): Promise<ApproverKeyChallengeResponse> {
  return api.post('api/approver-keys/challenge', { json: {} }).json<ApproverKeyChallengeResponse>()
}

export async function submitApproverKeySetChange(
  route: ApproverKeyChangeRoute,
  body: ApproverKeySetChangeBody,
): Promise<void> {
  await api.post(`api/approver-keys/${route}`, { json: body, retry: 0 })
}

export type SubmissionListState = 'pending' | 'trashed'

export interface SubmissionTargetItem {
  kind: string
  suggestedVaultId?: string
  vaultId?: string
  entryId?: string
  expectedEntryRevision?: string
}

export interface SubmissionListItem {
  submissionId: string
  agentId: string
  agentName: string
  submissionKind: number
  entryType: number
  target: SubmissionTargetItem
  suggestedVaultId: string | null
  state: string
  agentUseSuspended: boolean
  createdAt: string
  approverKeyVersion: number
}

export interface SubmissionDetailResponse {
  submission: AgentEntrySubmission
  /** The submitting Agent's Ed25519 key from the Agent directory, base64url. */
  agentEd25519PublicKey: string
  agentEd25519KeyVersion: number
}

export async function listSubmissions(state: SubmissionListState): Promise<SubmissionListItem[]> {
  const response = await api.get('api/submissions', { searchParams: { state } })
    .json<{ items: SubmissionListItem[] }>()
  return response.items
}

export function getSubmission(submissionId: string, signal?: AbortSignal): Promise<SubmissionDetailResponse> {
  return api.get(`api/submissions/${submissionId}`, { signal }).json<SubmissionDetailResponse>()
}

export interface SubmissionGrantBody {
  grantId: string
  vaultId: string
  entryId: string
  agentId: string
  grantEntry: Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>
  fieldSelectionMode: 'all'
  methods: string
}

export interface ApproveAsNewBody {
  vaultId: string
  entry: { vaultId: string; entryId: string; deliveryPolicy: 'standard' } & CanonicalEntryEnvelopes
  grant?: SubmissionGrantBody
}

export interface ApproveAsUpdateBody {
  entry: { vaultId: string; entryId: string } & EntryUpdateMaterial
  grant?: SubmissionGrantBody
}

export interface ApproveSubmissionResponse {
  submissionId: string
  vaultId: string
  entryId: string
  entryRevision: string
  grantId: string | null
}

export function approveSubmissionAsNewEntry(
  submissionId: string,
  body: ApproveAsNewBody,
): Promise<ApproveSubmissionResponse> {
  return api.post(`api/submissions/${submissionId}/approve-new`, { json: { submissionId, ...body }, retry: 0 })
    .json<ApproveSubmissionResponse>()
}

export function approveSubmissionAsUpdate(
  submissionId: string,
  body: ApproveAsUpdateBody,
): Promise<ApproveSubmissionResponse> {
  return api.post(`api/submissions/${submissionId}/approve-update`, { json: { submissionId, ...body }, retry: 0 })
    .json<ApproveSubmissionResponse>()
}

// Route-only FastEndpoints mutations need a JSON body to avoid HTTP 415.
export async function denySubmission(submissionId: string): Promise<void> {
  await api.post(`api/submissions/${submissionId}/deny`, { json: {} })
}

export async function restoreSubmission(submissionId: string): Promise<void> {
  await api.post(`api/submissions/${submissionId}/restore`, { json: {} })
}
