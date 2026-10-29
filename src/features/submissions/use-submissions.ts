import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  openSubmissionAsApprover,
  wipeApproverKeys,
  type AgentEntrySubmission,
  type AgentSubmissionPayload,
} from '../../shared/crypto/agent-submission'
import { decodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { useAuthStore } from '../auth'
import { GRANT_STATUS_ACTIVE, GRANT_TYPE_FULL, GRANT_TYPE_GRANULAR, getOrgGrants } from '../grants'
import { GRANT_MUTATION_INVALIDATION_KEYS } from '../grants/query-keys'
import { NOTIFICATIONS_QUERY_KEY } from '../notifications/notification-queries'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import {
  denySubmission,
  getSubmission,
  listSubmissions,
  restoreSubmission,
  type SubmissionListItem,
  type SubmissionListState,
} from './api/submissions-api'
import { loadOwnApproverKeys } from './approver-keys'
import { approveAsNewEntry, approveAsUpdate, type ApproveAsNewEntryInput, type ApproveAsUpdateInput } from './submission-approval'
import { useCanReviewSubmissions } from './use-approver-keys'

export const SUBMISSIONS_QUERY_KEY = ['submissions'] as const
const SUBMISSION_REVIEW_QUERY_KEY = ['submission-review'] as const

export function useSubmissions(state: SubmissionListState) {
  const canReview = useCanReviewSubmissions()
  return useQuery({
    queryKey: [...SUBMISSIONS_QUERY_KEY, state],
    queryFn: () => listSubmissions(state),
    enabled: canReview,
    staleTime: 15_000,
  })
}

export interface OpenedSubmission {
  submission: AgentEntrySubmission
  payload: AgentSubmissionPayload
}

async function openSubmission(item: SubmissionListItem, signal: AbortSignal): Promise<OpenedSubmission> {
  const [detail, { keys, authority }] = await Promise.all([
    getSubmission(item.submissionId, signal),
    loadOwnApproverKeys(),
  ])
  try {
    const payload = await openSubmissionAsApprover(detail.submission, {
      organizationId: authority.organizationId,
      agentId: item.agentId,
      agentEd25519PublicKey: decodeBase64Url(detail.agentEd25519PublicKey),
      approverKeys: keys,
    })
    return { submission: detail.submission, payload }
  } finally {
    wipeApproverKeys(keys)
  }
}

/**
 * Verifies and decrypts one pending submission for review. Plaintext lives
 * only in this unlocked session's in-memory query, is dropped when the view
 * unmounts and is removed as soon as the Vault locks.
 */
export function useSubmissionReview(item: SubmissionListItem | undefined) {
  const queryClient = useQueryClient()
  const sessionKey = useAuthStore((state) => state.privateKey)
  const generation = useAuthStore((state) => state.cryptoSessionGeneration)
  useEffect(() => {
    if (!sessionKey) queryClient.removeQueries({ queryKey: SUBMISSION_REVIEW_QUERY_KEY })
  }, [queryClient, sessionKey])
  return useQuery({
    queryKey: [...SUBMISSION_REVIEW_QUERY_KEY, item?.submissionId, item?.approverKeyVersion, generation],
    queryFn: ({ signal }) => openSubmission(item!, signal),
    enabled: Boolean(sessionKey && item && item.state === 'pending'),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })
}

export type ExistingAgentAccess = 'none' | 'full' | 'entry'

/** Active coverage for the Agent; a covered Entry gets no second grant. */
export function useExistingAgentAccess(agentId: string | undefined, vaultId: string | undefined, entryId?: string) {
  return useQuery({
    queryKey: ['grants', 'submission-coverage', agentId, vaultId, entryId ?? null],
    enabled: Boolean(agentId && vaultId),
    queryFn: async (): Promise<ExistingAgentAccess> => {
      let cursor: string | undefined
      do {
        const page = await getOrgGrants({ agentId, vaultId, status: GRANT_STATUS_ACTIVE, cursor, pageSize: 100 })
        if (page.items.some((grant) => grant.agentId === agentId && grant.vaultId === vaultId && grant.type === GRANT_TYPE_FULL)) {
          return 'full'
        }
        if (entryId && page.items.some((grant) => grant.agentId === agentId && grant.type === GRANT_TYPE_GRANULAR
          && grant.entryScopes.some((scope) => scope.entryId === entryId))) return 'entry'
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      return 'none'
    },
  })
}

function useInvalidateAfterDecision() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: SUBMISSIONS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
  }
}

export function useApproveSubmission() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterDecision()
  return useMutation({
    mutationFn: (input: ({ kind: 'new' } & ApproveAsNewEntryInput) | ({ kind: 'update' } & ApproveAsUpdateInput)) =>
      input.kind === 'new' ? approveAsNewEntry(input) : approveAsUpdate(input),
    onSuccess: () => {
      for (const queryKey of GRANT_MUTATION_INVALIDATION_KEYS) void queryClient.invalidateQueries({ queryKey })
      useMemberSyncStore.getState().retry()
    },
    onSettled: invalidate,
  })
}

export function useDenySubmission() {
  const invalidate = useInvalidateAfterDecision()
  return useMutation({ mutationFn: denySubmission, onSettled: invalidate })
}

export function useRestoreSubmission() {
  const invalidate = useInvalidateAfterDecision()
  return useMutation({ mutationFn: restoreSubmission, onSettled: invalidate })
}
