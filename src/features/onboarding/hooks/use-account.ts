import { useQuery } from '@tanstack/react-query'
import { getAccount } from '../api/account-api'

export const ACCOUNT_QUERY_KEY = ['account'] as const

export function useAccount() {
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccount,
  })
}
