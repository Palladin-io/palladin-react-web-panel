import { useQuery } from '@tanstack/react-query'
import { listPendingRotations } from './rotation/rotation-api'

export const pendingRotationsQueryKey = ['vault-key-rotations', 'pending'] as const

export function usePendingRotations(enabled = true) {
  return useQuery({
    queryKey: pendingRotationsQueryKey,
    queryFn: ({ signal }) => listPendingRotations(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
    enabled,
  })
}
