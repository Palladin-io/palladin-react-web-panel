import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analytics } from '../../../shared/lib/analytics'
import { queryClient } from '../../../shared/api/query-client'
import { useMemberSyncStore } from '../../../shared/stores/member-sync-store'
import { useAuthStore } from '../stores/auth-store'
import {
  captureClientSessionGeneration,
  clearClientSession,
  logoutAndReload,
} from './client-session'

const originalLocation = window.location

describe('client session cleanup', () => {
  beforeEach(() => {
    queryClient.clear()
    useMemberSyncStore.getState().clear()
    useAuthStore.getState().logout()
    vi.spyOn(analytics, 'reset').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('wipes keys, auth, server cache, mutation cache and decrypted member state', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      userId: 'user-a',
      isOnboarded: true,
    })
    useAuthStore.getState().unlockVault(
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    )
    const masterKey = useAuthStore.getState().masterKey!
    const privateKey = useAuthStore.getState().privateKey!
    queryClient.setQueryData(['vaults'], [{ id: 'vault-a' }])
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['create-entry'],
      mutationFn: async () => undefined,
    })
    useMemberSyncStore.setState({ status: 'ready', error: null })
    sessionStorage.setItem(
      'palladin:waitlist-developer-benefit-dialog-accepted',
      'v1.period-id',
    )
    const generation = captureClientSessionGeneration()

    clearClientSession()

    expect(captureClientSessionGeneration()).toBe(generation + 1)
    expect(Array.from(masterKey)).toEqual([0, 0])
    expect(Array.from(privateKey)).toEqual([0, 0])
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      userId: null,
      isVaultLocked: true,
    })
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(useMemberSyncStore.getState()).toMatchObject({
      status: 'idle',
      vaults: new Map(),
      error: null,
    })
    expect(sessionStorage.getItem(
      'palladin:waitlist-developer-benefit-dialog-accepted',
    )).toBeNull()
    expect(analytics.reset).toHaveBeenCalledOnce()
  })

  it('hard-reloads only after local state is already clean', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace },
    })
    useAuthStore.getState().setTokens({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      userId: 'user-a',
      isOnboarded: true,
    })
    const cleanup = vi.fn(async () => {
      expect(useAuthStore.getState().userId).toBe('user-a')
    })

    await logoutAndReload('/login?redirect=%2Fvaults', cleanup)

    expect(cleanup).toHaveBeenCalledOnce()
    expect(useAuthStore.getState().userId).toBeNull()
    expect(replace).toHaveBeenCalledWith('/login?redirect=%2Fvaults')
  })
})
