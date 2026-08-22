import { useQuery } from '@tanstack/react-query'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../shared/api/account-api'

export { ACCOUNT_QUERY_KEY }

export function useAccount() {
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })
}
