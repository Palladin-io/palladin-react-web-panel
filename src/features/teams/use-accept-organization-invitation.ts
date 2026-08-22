import { useAuthenticatedMutation as useMutation } from '../auth/session/use-authenticated-mutation'
import {
  replaceAuthenticatedSession,
  StaleAuthenticatedSessionError,
} from '../auth/session/session-boundary'
import { clearPushTokenOnLogout } from '../notifications'
import { acceptOrganizationInvitation } from './api/organization-invitations-api'

export function useAcceptOrganizationInvitation() {
  return useMutation({
    mutationFn: async (input: Parameters<typeof acceptOrganizationInvitation>[0], context) => {
      const response = await acceptOrganizationInvitation(input)
      void clearPushTokenOnLogout(context.sessionSnapshot)
      const session = await replaceAuthenticatedSession(response, {
        expectedSession: context.sessionSnapshot,
        lockVault: true,
      })
      if (!session) throw new StaleAuthenticatedSessionError()
      context.adoptSession(session)
      return response
    },
  })
}
