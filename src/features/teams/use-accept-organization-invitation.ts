import { useMutation } from '@tanstack/react-query'
import { captureClientSessionGeneration, clientSessionGenerationMatches, clearClientSession,
  revokeUninstalledLoginSession, useAuthStore } from '../auth'
import { acceptOrganizationInvitation } from './api/organization-invitations-api'

export function useAcceptOrganizationInvitation() {
  return useMutation({
    mutationFn: async (token: string) => {
      const generation = captureClientSessionGeneration()
      const session = await acceptOrganizationInvitation(token)
      let installed = false
      try {
        if (!clientSessionGenerationMatches(generation)) throw new Error('Invitation session changed')
        const cleanup = clearClientSession()
        const clearedGeneration = captureClientSessionGeneration()
        await cleanup
        if (!clientSessionGenerationMatches(clearedGeneration)) throw new Error('Invitation session changed')
        const auth = useAuthStore.getState()
        auth.setTokens(session)
        auth.lockVault()
        installed = true
        return session
      } finally {
        if (!installed) await revokeUninstalledLoginSession(session.accessToken)
      }
    },
  })
}
