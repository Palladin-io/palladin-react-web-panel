import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import {
  ORGANIZATION_MEMBERS_QUERY_KEY,
  requestOrganizationMemberRemoval,
} from '../../shared/api/organization-members-api'
import {
  getVaultMembers,
} from './api/vault-members-api'
import { authenticatedQueryKey, useAuthenticatedQueryKey } from '../auth'

export const vaultMembersQueryKey = (vaultId: string) =>
  ['vaults', vaultId, 'members'] as const

export function useVaultMembers(vaultId: string, enabled = true, poll = true) {
  const queryKey = useAuthenticatedQueryKey(vaultMembersQueryKey(vaultId))
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getVaultMembers(vaultId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextAfterId ?? undefined,
    staleTime: 5_000,
    refetchInterval: poll ? 5_000 : false,
    enabled,
  })
}

export function useRequestMemberRemoval(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: requestOrganizationMemberRemoval,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: authenticatedQueryKey(vaultMembersQueryKey(vaultId)),
        }),
        queryClient.invalidateQueries({
          queryKey: authenticatedQueryKey(ORGANIZATION_MEMBERS_QUERY_KEY),
        }),
      ])
    },
  })
}
