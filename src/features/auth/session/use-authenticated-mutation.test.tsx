import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../../app/query-client'
import type { AuthResponse } from '../../../shared/api/types'
import { useAuthStore } from '../stores/auth-store'
import { replaceAuthenticatedSession } from './session-boundary'
import { useAuthenticatedMutation } from './use-authenticated-mutation'

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

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useAuthenticatedMutation', () => {
  beforeEach(() => {
    queryClient.clear()
    useAuthStore.getState().logout()
  })

  it('snapshots the mutation namespace at invocation time', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    let finishA!: () => void
    const pendingA = new Promise<void>((resolve) => {
      finishA = resolve
    })
    const { result } = renderHook(() => useAuthenticatedMutation({
      mutationKey: ['api-keys', 'generate'],
      mutationFn: async (value: string) => {
        if (value === 'secret-a') await pendingA
        return value
      },
    }), { wrapper })

    act(() => result.current.mutate('secret-a'))
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(1))
    expect(queryClient.getMutationCache().getAll()[0]?.options.mutationKey)
      .toEqual(['authenticated', 'user-a', 'org-a', expect.any(Number), 'api-keys', 'generate'])

    await act(async () => {
      await replaceAuthenticatedSession(session('user-b', 'org-b'))
    })
    act(() => result.current.mutate('secret-b'))
    await waitFor(() => expect(result.current.data).toBe('secret-b'))

    expect(queryClient.getMutationCache().getAll()[0]?.options.mutationKey)
      .toEqual(['authenticated', 'user-b', 'org-b', expect.any(Number), 'api-keys', 'generate'])
    finishA()
  })

  it('clears secret variables/results and suppresses late A callbacks after B replaces it', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    let resolveA!: (value: string) => void
    const lateA = new Promise<string>((resolve) => {
      resolveA = resolve
    })
    const hookSuccess = vi.fn()
    const callSuccess = vi.fn()
    const { result } = renderHook(() => useAuthenticatedMutation({
      mutationKey: ['recovery', 'consume'],
      mutationFn: async (secret: string) => {
        expect(secret).toBe('recovery-secret-a')
        return lateA
      },
      onSuccess: hookSuccess,
    }), { wrapper })

    act(() => result.current.mutate('recovery-secret-a', {
      onSuccess: callSuccess,
    }))
    await waitFor(() => expect(result.current.isPending).toBe(true))

    await act(async () => {
      await replaceAuthenticatedSession(session('user-b', 'org-b'))
    })

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    await waitFor(() => {
      expect(result.current.variables).toBeUndefined()
      expect(result.current.data).toBeUndefined()
    })
    resolveA('plaintext-result-a')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(hookSuccess).not.toHaveBeenCalled()
    expect(callSuccess).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })
})
