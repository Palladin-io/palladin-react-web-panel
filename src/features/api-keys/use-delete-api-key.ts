import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteApiKey } from './api/api-keys-api'
import { API_KEYS_QUERY_KEY } from './use-api-keys'

export function useDeleteApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => deleteApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
    },
  })
}
