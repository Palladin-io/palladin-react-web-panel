import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateOrganization, type UpdateOrgInput } from './api/org-api'
import { ORG_QUERY_KEY } from './use-org'

export function useUpdateOrg() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateOrgInput) => updateOrganization(input),
    onSuccess: () => {
      // The org cache holds a stale name after a successful rename —
      // invalidate so the settings header refetches on next focus.
      queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEY })
    },
  })
}
