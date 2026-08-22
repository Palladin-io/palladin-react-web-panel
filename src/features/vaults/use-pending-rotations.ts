import { useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey } from '../auth'
import { listPendingRotations } from './rotation/rotation-api'

export const pendingRotationsQueryKey = ['vault-key-rotations', 'pending'] as const

export function usePendingRotations(enabled = true) {
  const queryKey = useAuthenticatedQueryKey(pendingRotationsQueryKey)
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => listPendingRotations(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
    enabled,
  })
}
