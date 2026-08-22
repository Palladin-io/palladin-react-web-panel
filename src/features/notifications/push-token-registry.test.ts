import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../../shared/api/types'
import { useAuthStore } from '../auth/stores/auth-store'
import {
  captureAuthenticatedSession,
  terminateAuthenticatedSession,
} from '../auth/session/session-boundary'
import {
  clearPushTokenOnLogout,
  getPushTokenId,
  setPushTokenId,
} from './push-token-registry'

const deletePushToken = vi.hoisted(() => vi.fn())

vi.mock('./push-api', () => ({ deletePushToken }))

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({
    sub: userId,
    org_id: organizationId,
  })}.signature`
}

function session(userId: string, organizationId: string): AuthResponse {
  return {
    accessToken: jwt(userId, organizationId),
    refreshToken: `refresh-${userId}-${organizationId}`,
    userId,
    isOnboarded: true,
    emailVerified: true,
  }
}

describe('push token session boundary', () => {
  beforeEach(() => {
    deletePushToken.mockReset().mockResolvedValue(undefined)
    useAuthStore.getState().logout()
    setPushTokenId(null)
  })

  it('rejects a late A registration after the principal changes to B', () => {
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const sessionA = captureAuthenticatedSession()
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))

    expect(setPushTokenId('push-a', sessionA)).toBe(false)
    expect(getPushTokenId()).toBeNull()
  })

  it('does not let stale A cleanup clear B registration', async () => {
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const sessionA = captureAuthenticatedSession()
    expect(setPushTokenId('push-a', sessionA)).toBe(true)
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    const sessionB = captureAuthenticatedSession()
    expect(setPushTokenId('push-b', sessionB)).toBe(true)

    await clearPushTokenOnLogout(sessionA)

    expect(getPushTokenId()).toBe('push-b')
    expect(deletePushToken).not.toHaveBeenCalled()
  })

  it('disables local delivery synchronously and keeps it disabled while remote deletion waits', async () => {
    let finishDelete!: () => void
    deletePushToken.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishDelete = resolve
    }))
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const sessionA = captureAuthenticatedSession()
    setPushTokenId('push-a', sessionA)

    const cleanup = clearPushTokenOnLogout(sessionA)

    expect(getPushTokenId()).toBeNull()
    expect(deletePushToken).toHaveBeenCalledWith('push-a', sessionA)
    finishDelete()
    await cleanup
  })

  it('resets the in-memory registry as part of the central boundary', async () => {
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const sessionA = captureAuthenticatedSession()
    setPushTokenId('push-a', sessionA)

    await terminateAuthenticatedSession(sessionA)

    expect(getPushTokenId()).toBeNull()
  })
})
