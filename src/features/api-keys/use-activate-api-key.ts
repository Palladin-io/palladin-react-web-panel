import { useMutation, useQueryClient } from '@tanstack/react-query'
import { activateApiKey } from './api/api-keys-api'
import { API_KEYS_QUERY_KEY } from './use-api-keys'

export function useActivateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => activateApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
    },
  })
}
