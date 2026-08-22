import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { deleteApiKey } from './api/api-keys-api'
import { API_KEYS_QUERY_KEY } from './use-api-keys'
import { authenticatedQueryKey } from '../auth'

export function useDeleteApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (keyId: string) => deleteApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(API_KEYS_QUERY_KEY) })
    },
  })
}
