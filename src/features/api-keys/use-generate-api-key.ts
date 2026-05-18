import { useMutation, useQueryClient } from '@tanstack/react-query'
import { generateApiKey } from './api/api-keys-api'
import { API_KEYS_QUERY_KEY } from './use-api-keys'

export function useGenerateApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => generateApiKey(name),
    onSuccess: () => {
      // A new key now exists server-side — invalidate the list so it
      // appears once the user closes the one-time-secret modal.
      queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
    },
  })
}
