import { useQuery } from '@tanstack/react-query'
import { getGrant } from './api/grants-api'
import { grantDetailQueryKey } from './query-keys'

/** Fetches a single grant's detail. Gated by `enabled` to keep hook order stable. */
export function useGrant(vaultId: string, grantId: string) {
  return useQuery({
    queryKey: grantDetailQueryKey(vaultId, grantId),
    queryFn: () => getGrant(vaultId, grantId),
    staleTime: 30_000,
    enabled: Boolean(vaultId && grantId),
  })
}
