import type { QueryKey } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAuthStore } from '../stores/auth-store'

export const AUTHENTICATED_QUERY_ROOT = ['authenticated'] as const

export interface AuthenticatedQueryScope {
  userId: string | null
  organizationId: string | null
  sessionGeneration: number
}

function currentScope(): AuthenticatedQueryScope {
  const { userId, organizationId, sessionGeneration } = useAuthStore.getState()
  return {
    userId,
    organizationId,
    sessionGeneration,
  }
}

export function authenticatedQueryKeyForSession<T extends QueryKey>(
  scope: AuthenticatedQueryScope,
  queryKey: T,
) {
  return [
    ...AUTHENTICATED_QUERY_ROOT,
    scope.userId ?? 'no-user',
    scope.organizationId ?? 'no-organization',
    scope.sessionGeneration,
    ...queryKey,
  ] as const
}

export function authenticatedQueryKey<T extends QueryKey>(queryKey: T) {
  return authenticatedQueryKeyForSession(currentScope(), queryKey)
}

export function useAuthenticatedQueryKey<T extends QueryKey>(queryKey: T) {
  const userId = useAuthStore((state) => state.userId) ?? 'no-user'
  const organizationId =
    useAuthStore((state) => state.organizationId) ?? 'no-organization'
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration)

  return useMemo(
    () => [
      ...AUTHENTICATED_QUERY_ROOT,
      userId,
      organizationId,
      sessionGeneration,
      ...queryKey,
    ] as const,
    [organizationId, queryKey, sessionGeneration, userId],
  )
}
