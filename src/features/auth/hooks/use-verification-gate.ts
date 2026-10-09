import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ACCOUNT_QUERY_KEY, getAccount, type AccountResponse } from '../../../shared/api/account-api'
import { refreshSession } from '../api/auth-api'
import { captureClientSessionGeneration, clientSessionGenerationMatches } from '../session/client-session'
import { useAuthStore } from '../stores/auth-store'

interface VerificationGateResult { account: AccountResponse; ready: boolean }

export function useVerificationGate() {
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.userId)
  const cryptoGeneration = useAuthStore((state) => state.cryptoSessionGeneration)
  return useQuery<VerificationGateResult>({
    queryKey: [...ACCOUNT_QUERY_KEY, 'verification-gate', userId, cryptoGeneration],
    enabled: !!userId,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: 'always',
    refetchInterval: (query) => query.state.data?.ready ? false : 15_000,
    queryFn: async ({ signal }) => {
      const generation = captureClientSessionGeneration()
      const { userId: capturedUserId, sessionId: capturedSessionId,
        cryptoSessionGeneration: capturedCryptoGeneration } = useAuthStore.getState()
      const current = () => {
        const auth = useAuthStore.getState()
        return !signal.aborted && clientSessionGenerationMatches(generation)
          && auth.userId === capturedUserId && auth.cryptoSessionGeneration === capturedCryptoGeneration
          && auth.sessionId === capturedSessionId
      }
      try {
        const account = await getAccount()
        if (!current()) throw new Error('Verification session changed')
        if (account.emailVerified !== true) return { account, ready: false }
        if (!capturedSessionId) throw new Error('Verification session unavailable')
        // A verification in another tab changes server claims, not this tab's JWT.
        const session = await refreshSession(capturedSessionId)
        if (!current()) throw new Error('Verification session changed')
        useAuthStore.getState().setTokens(session)
        useAuthStore.getState().markEmailVerified()
        queryClient.setQueryData(ACCOUNT_QUERY_KEY, account)
        return { account, ready: true }
      } catch {
        // HTTP errors may retain a refresh request; never put them in the query cache.
        throw new Error('Verification session unavailable')
      }
    },
  })
}
