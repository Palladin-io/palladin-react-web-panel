import { useMutation, useQueryClient } from '@tanstack/react-query'
import { revokeApiKey } from './api/api-keys-api'
import { API_KEYS_QUERY_KEY } from './use-api-keys'

export function useRevokeApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => revokeApiKey(keyId),
    onSuccess: () => {
      // The revoked key's status flipped to Revoked — invalidate so the
      // list badge updates.
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
    },
  })
}
