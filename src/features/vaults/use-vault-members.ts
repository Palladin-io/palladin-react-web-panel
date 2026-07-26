import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getVaultMembers,
  requestOrganizationMemberRemoval,
} from './api/vault-members-api'

export const vaultMembersQueryKey = (vaultId: string) =>
  ['vaults', vaultId, 'members'] as const

export function useVaultMembers(vaultId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: vaultMembersQueryKey(vaultId),
    queryFn: ({ pageParam }) => getVaultMembers(vaultId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextAfterId ?? undefined,
    staleTime: 5_000,
    refetchInterval: 5_000,
    enabled,
  })
}

export function useRequestMemberRemoval(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: requestOrganizationMemberRemoval,
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: vaultMembersQueryKey(vaultId),
    }),
  })
}
