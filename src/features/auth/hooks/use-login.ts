import { useAuthenticatedMutation as useMutation } from '../session/use-authenticated-mutation'
import { useNavigate } from '@tanstack/react-router'
import { oauthGoogle } from '../api/auth-api'
import {
  replaceAuthenticatedSession,
  StaleAuthenticatedSessionError,
} from '../session/session-boundary'

export function useLogin(redirectTo = '/') {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (token: string, context) => {
      const data = await oauthGoogle(token)
      const session = await replaceAuthenticatedSession(data, {
        expectedSession: context.sessionSnapshot,
      })
      if (!session) throw new StaleAuthenticatedSessionError()
      context.adoptSession(session)
      return data
    },
    onSuccess: () => {
      navigate({ href: redirectTo })
    },
  })
}
