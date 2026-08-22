import { useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey } from '../auth'
import { getGrant } from './api/grants-api'
import { grantDetailQueryKey } from './query-keys'

/** Fetches a single grant's detail. Gated by `enabled` to keep hook order stable. */
export function useGrant(vaultId: string, grantId: string) {
  const queryKey = useAuthenticatedQueryKey(grantDetailQueryKey(vaultId, grantId))
  return useQuery({
    queryKey,
    queryFn: () => getGrant(vaultId, grantId),
    staleTime: 30_000,
    enabled: Boolean(vaultId && grantId),
  })
}
