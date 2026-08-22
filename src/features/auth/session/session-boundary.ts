import type { AuthResponse } from '../../../shared/api/types'
import { analytics } from '../../../shared/lib/analytics'
import {
  resetAuthenticatedPrincipalState,
  stopAuthenticatedPrincipalProducers,
} from '../../../shared/lib/authenticated-principal-reset'
import { queryClient } from '../../../app/query-client'
import { assertAuthenticatedPrincipal, useAuthStore } from '../stores/auth-store'
import { AUTHENTICATED_QUERY_ROOT } from './authenticated-query-key'

export interface AuthenticatedSessionSnapshot {
  accessToken: string | null
  refreshToken: string | null
  userId: string | null
  organizationId: string | null
  sessionGeneration: number
  sessionBoundaryActive: boolean
}

export class StaleAuthenticatedSessionError extends Error {
  constructor() {
    super('Authenticated operation belongs to an inactive session')
    this.name = 'StaleAuthenticatedSessionError'
  }
}

export function captureAuthenticatedSession(): AuthenticatedSessionSnapshot {
  const state = useAuthStore.getState()
  return {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    userId: state.userId,
    organizationId: state.organizationId,
    sessionGeneration: state.sessionGeneration,
    sessionBoundaryActive: state.sessionBoundaryActive,
  }
}

export function authenticatedSessionMatches(
  snapshot: AuthenticatedSessionSnapshot,
): boolean {
  const current = captureAuthenticatedSession()
  return current.accessToken === snapshot.accessToken
    && current.refreshToken === snapshot.refreshToken
    && current.userId === snapshot.userId
    && current.organizationId === snapshot.organizationId
    && current.sessionGeneration === snapshot.sessionGeneration
    && current.sessionBoundaryActive === snapshot.sessionBoundaryActive
}

function claimAuthenticatedSession(
  expected: AuthenticatedSessionSnapshot,
): AuthenticatedSessionSnapshot | null {
  let claimed = false
  useAuthStore.setState((state) => {
    if (state.accessToken !== expected.accessToken
      || state.refreshToken !== expected.refreshToken
      || state.userId !== expected.userId
      || state.organizationId !== expected.organizationId
      || state.sessionGeneration !== expected.sessionGeneration
      || state.sessionBoundaryActive !== expected.sessionBoundaryActive
      || state.sessionBoundaryActive) {
      return state
    }
    claimed = true
    return {
      sessionGeneration: state.sessionGeneration + 1,
      sessionBoundaryActive: true,
    }
  })
  return claimed ? captureAuthenticatedSession() : null
}

let sessionBoundaryQueue: Promise<void> = Promise.resolve()

function serializeSessionBoundary<T>(operation: () => Promise<T>): Promise<T> {
  const result = sessionBoundaryQueue.then(operation, operation)
  sessionBoundaryQueue = result.then(() => undefined, () => undefined)
  return result
}

async function clearAuthenticatedPrincipalState(
  claimed: AuthenticatedSessionSnapshot,
): Promise<boolean> {
  try {
    await queryClient.cancelQueries({ queryKey: AUTHENTICATED_QUERY_ROOT })
  } catch {
    // Cache removal and the principal wipe still have to complete fail-closed.
  }
  if (!authenticatedSessionMatches(claimed)) return false
  // Every cleanup concern is isolated so a third-party reset (notably
  // analytics) can never strand a claimed boundary before the fail-closed
  // token/key wipe. Cache/reset failures are deliberately not propagated.
  try {
    queryClient.getMutationCache().clear()
  } catch {
    // Continue to the principal wipe.
  }
  try {
    queryClient.removeQueries({ queryKey: AUTHENTICATED_QUERY_ROOT })
  } catch {
    // Continue to the principal wipe.
  }
  try {
    resetAuthenticatedPrincipalState()
  } catch {
    // Continue to the principal wipe.
  }
  try {
    analytics.reset()
  } catch {
    // Analytics is never allowed to block a security boundary.
  }
  return authenticatedSessionMatches(claimed)
}

export async function replaceAuthenticatedSession(
  session: AuthResponse,
  options: {
    lockVault?: boolean
    expectedSession?: AuthenticatedSessionSnapshot
  } = {},
): Promise<AuthenticatedSessionSnapshot | null> {
  assertAuthenticatedPrincipal(session)
  const expected = options.expectedSession ?? captureAuthenticatedSession()
  return serializeSessionBoundary(async () => {
    const claimed = claimAuthenticatedSession(expected)
    if (!claimed) return null
    stopAuthenticatedPrincipalProducers()
    if (!(await clearAuthenticatedPrincipalState(claimed))) return null
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session)
    if (options.lockVault) useAuthStore.getState().lockVault()
    return captureAuthenticatedSession()
  })
}

export async function terminateAuthenticatedSession(
  expected: AuthenticatedSessionSnapshot = captureAuthenticatedSession(),
): Promise<boolean> {
  return serializeSessionBoundary(async () => {
    const claimed = claimAuthenticatedSession(expected)
    if (!claimed) return false
    stopAuthenticatedPrincipalProducers()
    if (!(await clearAuthenticatedPrincipalState(claimed))) return false
    useAuthStore.getState().logout()
    return true
  })
}

export async function expireAuthenticatedSession(
  expected: AuthenticatedSessionSnapshot = captureAuthenticatedSession(),
): Promise<boolean> {
  return serializeSessionBoundary(async () => {
    const claimed = claimAuthenticatedSession(expected)
    if (!claimed) return false
    stopAuthenticatedPrincipalProducers()
    if (!(await clearAuthenticatedPrincipalState(claimed))) return false
    useAuthStore.getState().expireSession()
    return true
  })
}

export function unlockVaultForSession(
  expected: AuthenticatedSessionSnapshot,
  masterKey: Uint8Array,
  privateKey: Uint8Array,
): boolean {
  if (!authenticatedSessionMatches(expected)) return false
  useAuthStore.getState().unlockVault(masterKey, privateKey)
  return authenticatedSessionMatches(expected)
}

export function markOnboardedForSession(
  expected: AuthenticatedSessionSnapshot,
): boolean {
  if (!authenticatedSessionMatches(expected)) return false
  useAuthStore.getState().markOnboarded()
  return authenticatedSessionMatches(expected)
}

export function markEmailVerifiedForSession(
  expected: AuthenticatedSessionSnapshot,
): boolean {
  if (!authenticatedSessionMatches(expected)) return false
  useAuthStore.getState().markEmailVerified()
  return authenticatedSessionMatches(expected)
}
