import { useMutation } from '@tanstack/react-query'
import { clearClientSession, useAuthStore } from '../auth'
import { acceptOrganizationInvitation } from './api/organization-invitations-api'

export function useAcceptOrganizationInvitation() {
  return useMutation({
    mutationFn: acceptOrganizationInvitation,
    onSuccess: (session) => {
      clearClientSession()
      const auth = useAuthStore.getState()
      auth.setTokens(session)
      // The session now points at another organization. Wipe the old
      // organization's in-memory keys before any of its decrypted state can be
      // rendered under the new JWT; the user unlocks again on the success CTA.
      auth.lockVault()
    },
  })
}
