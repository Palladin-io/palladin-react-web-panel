import { useQuery } from '@tanstack/react-query'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../shared/api/account-api'
import { useAuthenticatedQueryKey } from '../../auth'

export { ACCOUNT_QUERY_KEY }

export function useAccount() {
  const queryKey = useAuthenticatedQueryKey(ACCOUNT_QUERY_KEY)
  return useQuery({
    queryKey,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })
}
