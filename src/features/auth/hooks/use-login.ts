import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { AuthResponse } from '../../../shared/api/types'
import { oauthGoogle, revokeUninstalledLoginSession } from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'

export interface OAuthLoginAttempt {
  readonly googleToken: string
  assertCurrent(): void
  finish(): void
}

export function useLogin(redirectTo = '/') {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (attempt: OAuthLoginAttempt) => {
      let issued: AuthResponse | null = null
      let installed = false
      try {
        attempt.assertCurrent()
        issued = await oauthGoogle(attempt.googleToken)
        // No await between this check and publication/navigation. A cancelled
        // popup must not pair a new user's tokens with someone else's RAM keys.
        attempt.assertCurrent()
        const state = useAuthStore.getState()
        if (!state.isVaultLocked || state.masterKey || state.privateKey) throw new Error('Login attempt changed')
        state.setTokens(issued)
        attempt.assertCurrent()
        installed = true
        void navigate({ href: redirectTo })
        return issued
      } finally {
        if (issued && !installed) void revokeUninstalledLoginSession(issued.refreshToken)
        attempt.finish()
      }
    },
  })
}
