import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { activateApiKey } from './api/api-keys-api'
import { API_KEYS_QUERY_KEY } from './use-api-keys'
import { authenticatedQueryKey } from '../auth'

export function useActivateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => activateApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(API_KEYS_QUERY_KEY) })
    },
  })
}
