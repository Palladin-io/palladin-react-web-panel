import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../../app/query-client'
import type { AuthResponse } from '../../../shared/api/types'
import { claimNotificationEvent } from '../../notifications/notification-deduplication'
import { useAuthStore } from '../stores/auth-store'
import { useMemberSyncStore } from '../../../shared/stores/member-sync-store'
import {
  authenticatedQueryKey,
  useAuthenticatedQueryKey,
} from './authenticated-query-key'
import {
  captureAuthenticatedSession,
  expireAuthenticatedSession,
  replaceAuthenticatedSession,
  terminateAuthenticatedSession,
} from './session-boundary'

const analyticsReset = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { reset: analyticsReset },
}))

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({ sub: userId, org_id: organizationId })}.signature`
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

const notification = {
  type: 'grant_pending',
  subjectId: 'grant-1',
  occurredAt: '2026-08-22T00:00:00Z',
  data: {},
} as const

describe('authenticated session boundary', () => {
  beforeEach(() => {
    queryClient.clear()
    useAuthStore.getState().logout()
    useMemberSyncStore.getState().clear()
    analyticsReset.mockReset()
  })

  it('isolates A → logout → B cache and principal state', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    const aKey = authenticatedQueryKey(['account'])
    queryClient.setQueryData(aKey, { displayName: 'Account A' })
    useMemberSyncStore.getState().begin()
    expect(claimNotificationEvent(notification)).toBe(true)
    expect(claimNotificationEvent(notification)).toBe(false)

    await terminateAuthenticatedSession()
    expect(queryClient.getQueryData(aKey)).toBeUndefined()
    expect(useMemberSyncStore.getState().status).toBe('idle')
    expect(claimNotificationEvent(notification)).toBe(true)
    expect(analyticsReset).toHaveBeenCalled()

    await replaceAuthenticatedSession(session('user-b', 'org-b'))
    const bKey = authenticatedQueryKey(['account'])
    expect(bKey).not.toEqual(aKey)
    expect(queryClient.getQueryData(bKey)).toBeUndefined()
  })

  it('cancels requests before removing authenticated cache state', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    queryClient.setQueryData(authenticatedQueryKey(['account']), { id: 'a' })
    const cancel = vi.spyOn(queryClient, 'cancelQueries')
    const remove = vi.spyOn(queryClient, 'removeQueries')

    await terminateAuthenticatedSession()

    expect(cancel).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0]!,
    )
  })

  it('changes every authenticated query namespace on organization switch', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    useAuthStore.getState().unlockVault(
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    )
    const oldMasterKey = useAuthStore.getState().masterKey!
    const { result } = renderHook(() => useAuthenticatedQueryKey(['vaults']))
    const orgAKey = result.current

    await act(async () => {
      await replaceAuthenticatedSession(session('user-a', 'org-b'), {
        lockVault: true,
      })
    })

    expect(result.current).not.toEqual(orgAKey)
    expect(result.current.slice(0, 3)).toEqual([
      'authenticated',
      'user-a',
      'org-b',
    ])
    expect(useAuthStore.getState().masterKey).toBeNull()
    expect(Array.from(oldMasterKey)).toEqual([0, 0])
  })

  it('cancels an in-flight A query and never publishes its late result to B', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    const aKey = authenticatedQueryKey(['agents'])
    let resolveA!: (value: string) => void
    const lateA = new Promise<string>((resolve) => {
      resolveA = resolve
    })
    const request = queryClient.fetchQuery({
      queryKey: aKey,
      queryFn: () => lateA,
    })

    await replaceAuthenticatedSession(session('user-b', 'org-b'))
    resolveA('private account A data')
    await expect(request).rejects.toBeDefined()

    expect(queryClient.getQueryData(aKey)).toBeUndefined()
    expect(queryClient.getQueryData(authenticatedQueryKey(['agents']))).toBeUndefined()
  })

  it('serializes competing replacements so only the first expected-session CAS wins', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    const expectedA = captureAuthenticatedSession()

    const [replacementB, replacementC] = await Promise.all([
      replaceAuthenticatedSession(session('user-b', 'org-b'), {
        expectedSession: expectedA,
      }),
      replaceAuthenticatedSession(session('user-c', 'org-c'), {
        expectedSession: expectedA,
      }),
    ])

    expect(replacementB).not.toBeNull()
    expect(replacementC).toBeNull()
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'user-b',
      organizationId: 'org-b',
      accessToken: session('user-b', 'org-b').accessToken,
    })
  })

  it('rechecks its claimed generation after cancellation before wiping a replacement session', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    const expectedA = captureAuthenticatedSession()
    let releaseCancellation!: () => void
    const cancellationGate = new Promise<void>((resolve) => {
      releaseCancellation = resolve
    })
    const cancel = vi.spyOn(queryClient, 'cancelQueries')
      .mockImplementationOnce(async () => cancellationGate)

    const termination = terminateAuthenticatedSession(expectedA)
    await vi.waitFor(() => {
      expect(useAuthStore.getState().sessionBoundaryActive).toBe(true)
    })

    // Simulates an external replacement while the cancellation await is open.
    // The final write must CAS-fail instead of wiping this newer principal.
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    releaseCancellation()

    await expect(termination).resolves.toBe(false)
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'user-b',
      organizationId: 'org-b',
      accessToken: session('user-b', 'org-b').accessToken,
    })
    cancel.mockRestore()
  })

  it('removes pending secret-bearing mutations from MutationCache at the boundary', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    let releaseMutation!: () => void
    const pending = new Promise<void>((resolve) => {
      releaseMutation = resolve
    })
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: authenticatedQueryKey(['api-keys', 'generate']),
      mutationFn: async () => pending,
    })
    const execution = mutation.execute({ plaintextApiKey: 'pl_test_secret' })
    await vi.waitFor(() => expect(mutation.state.status).toBe('pending'))
    expect(queryClient.getMutationCache().getAll()).toContain(mutation)

    await terminateAuthenticatedSession()

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    releaseMutation()
    await execution
  })

  it.each([
    ['logout', terminateAuthenticatedSession, { refreshToken: null, userId: null, organizationId: null }],
    ['expiry', expireAuthenticatedSession, {
      refreshToken: 'refresh-user-a-org-a', userId: 'user-a', organizationId: 'org-a',
    }],
  ] as const)('completes the full %s wipe when analytics reset throws', async (
    _label,
    boundary,
    expectedIdentity,
  ) => {
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const masterKey = new Uint8Array([1, 2, 3])
    const privateKey = new Uint8Array([4, 5, 6])
    useAuthStore.getState().unlockVault(masterKey, privateKey)
    const storedMasterKey = useAuthStore.getState().masterKey!
    const storedPrivateKey = useAuthStore.getState().privateKey!
    queryClient.setQueryData(authenticatedQueryKey(['account']), { id: 'a' })
    analyticsReset.mockImplementationOnce(() => {
      throw new Error('analytics unavailable')
    })

    await expect(boundary(captureAuthenticatedSession())).resolves.toBe(true)

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      ...expectedIdentity,
      masterKey: null,
      privateKey: null,
      sessionBoundaryActive: false,
    })
    expect(Array.from(storedMasterKey)).toEqual([0, 0, 0])
    expect(Array.from(storedPrivateKey)).toEqual([0, 0, 0])
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
  })
})
