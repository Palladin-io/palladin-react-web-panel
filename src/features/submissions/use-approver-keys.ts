import { useEffect, useRef, useState } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApproverKeySetChangeKind } from '../../shared/crypto/agent-submission'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import {
  APPROVER_KEY_STATUS_ABSENT,
  APPROVER_KEY_STATUS_READY,
  APPROVER_KEY_STATUS_UNAVAILABLE,
  getApproverKeys,
  type ApproverKeysResponse,
} from './api/submissions-api'
import { isServedApprover, nextApproverKeyAction, runApproverKeyChange } from './approver-keys'

export const APPROVER_KEYS_QUERY_KEY = ['approver-keys'] as const
const MAINTENANCE_MUTATION_KEY = ['approver-keys', 'maintenance'] as const
const MAX_ATTEMPTS_PER_STATE = 3

export function useCanReviewSubmissions(): boolean {
  return useAuthStore((state) => (state.permissions & PERMISSION_GRANT_MANAGE) !== 0)
}

export function useApproverKeys() {
  const canReview = useCanReviewSubmissions()
  const unlocked = useAuthStore((state) => !state.isVaultLocked && state.privateKey !== null)
  return useQuery({
    queryKey: APPROVER_KEYS_QUERY_KEY,
    queryFn: getApproverKeys,
    enabled: canReview && unlocked,
    staleTime: 30_000,
  })
}

/**
 * Keeps the organization approver key set usable without extra clicks:
 * bootstrap when absent, wrap for new approvers, rotate after a removal or
 * Member-key change. Losers of a server compare-and-swap refetch and
 * re-evaluate; each observed state is attempted a bounded number of times.
 */
export function useApproverKeyMaintenance(): void {
  const queryClient = useQueryClient()
  const query = useApproverKeys()
  const generation = useAuthStore((state) => state.cryptoSessionGeneration)
  const attempts = useRef(new Map<string, number>())
  // Counts completed attempts whose refetch has finished. An identical refetched state keeps the same
  // `data` reference and may share a millisecond timestamp, so only this counter reliably re-runs the effect.
  const [settledAttempts, setSettledAttempts] = useState(0)
  const maintenance = useMutation({
    mutationKey: MAINTENANCE_MUTATION_KEY,
    mutationFn: ({ kind, state }: { kind: ApproverKeySetChangeKind; state: ApproverKeysResponse }) =>
      runApproverKeyChange(kind, state),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: APPROVER_KEYS_QUERY_KEY })
      setSettledAttempts((count) => count + 1)
    },
  })
  const { mutate, isPending } = maintenance
  const state = query.data
  const action = state ? nextApproverKeyAction(state) : null

  useEffect(() => {
    if (!state || !action || isPending || query.isFetching) return
    const attemptKey = [generation, action, state.manifest?.manifestRevision ?? '0', state.approverSetDigest].join(':')
    const count = attempts.current.get(attemptKey) ?? 0
    if (count >= MAX_ATTEMPTS_PER_STATE) return
    attempts.current.set(attemptKey, count + 1)
    mutate({ kind: action, state })
  }, [action, generation, isPending, mutate, query.isFetching, settledAttempts, state])
}

export function ApproverKeyReconciler() {
  useApproverKeyMaintenance()
  return null
}

export function useRebootstrapApproverKeys() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const state = await getApproverKeys()
      if (state.status !== APPROVER_KEY_STATUS_UNAVAILABLE) throw new Error('Re-bootstrap is not required')
      await runApproverKeyChange('rebootstrap', state)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: APPROVER_KEYS_QUERY_KEY }),
  })
}

export type ApproverKeyPresentation = 'loading' | 'error' | 'settingUp' | 'ready' | 'waiting' | 'unavailable'

export function approverKeyPresentation(
  state: ApproverKeysResponse | undefined,
  options: { isError: boolean; isMaintaining: boolean },
): ApproverKeyPresentation {
  if (options.isError) return 'error'
  if (!state) return 'loading'
  if (state.status === APPROVER_KEY_STATUS_UNAVAILABLE) return 'unavailable'
  if (options.isMaintaining || state.status === APPROVER_KEY_STATUS_ABSENT) return 'settingUp'
  if (state.status !== APPROVER_KEY_STATUS_READY) return 'error'
  if (!isServedApprover(state)) return 'waiting'
  return state.rotationRequired ? 'settingUp' : 'ready'
}

export function useApproverKeyPresentation(): ApproverKeyPresentation {
  const query = useApproverKeys()
  const isMaintaining = useIsMutating({ mutationKey: MAINTENANCE_MUTATION_KEY }) > 0
  return approverKeyPresentation(query.data, { isError: query.isError, isMaintaining })
}
