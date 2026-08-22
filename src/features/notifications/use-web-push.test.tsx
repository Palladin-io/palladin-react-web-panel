import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../../shared/api/types'
import {
  captureAuthenticatedSession,
  replaceAuthenticatedSession,
} from '../auth/session/session-boundary'
import { useAuthStore } from '../auth/stores/auth-store'
import { getPushTokenId } from './push-token-registry'
import { invalidateCurrentPushRegistration } from './push-registration-owner'
import { useWebPush } from './use-web-push'

const mocks = vi.hoisted(() => ({
  registerPushToken: vi.fn(),
  deletePushToken: vi.fn(),
  deletePushTokenForOwner: vi.fn(),
  getFirebaseMessaging: vi.fn(),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
  onMessage: vi.fn(() => vi.fn()),
  requestPermission: vi.fn(),
  registerServiceWorker: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../shared/lib/env', () => ({
  env: {
    firebaseApiKey: 'api-key',
    firebaseAuthDomain: 'firebase.example',
    firebaseProjectId: 'project',
    firebaseMessagingSenderId: 'sender',
    firebaseAppId: 'app',
    firebaseVapidKey: 'vapid',
  },
  isFirebaseConfigured: () => true,
}))
vi.mock('../../shared/push/firebase', () => ({
  getFirebaseMessaging: mocks.getFirebaseMessaging,
  getFirebaseToken: mocks.getToken,
  deleteFirebaseToken: mocks.deleteToken,
  onFirebaseMessage: mocks.onMessage,
}))
vi.mock('./push-api', () => ({
  registerPushToken: mocks.registerPushToken,
  deletePushToken: mocks.deletePushToken,
  deletePushTokenForOwner: mocks.deletePushTokenForOwner,
}))
vi.mock('./use-notification-invalidation', () => ({
  useNotificationInvalidation: () => vi.fn(),
}))
vi.mock('../../shared/lib/analytics', () => ({
  analytics: { reset: vi.fn() },
}))

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })}>
      {children}
    </QueryClientProvider>
  )
}

describe('useWebPush registration ownership', () => {
  beforeEach(async () => {
    await invalidateCurrentPushRegistration()
    vi.clearAllMocks()
    useAuthStore.getState().logout()
    mocks.getFirebaseMessaging.mockResolvedValue({ name: 'messaging' })
    mocks.getToken.mockResolvedValue('fcm-token-a')
    mocks.deleteToken.mockResolvedValue(true)
    mocks.deletePushToken.mockResolvedValue(undefined)
    mocks.deletePushTokenForOwner.mockResolvedValue(undefined)
    mocks.requestPermission.mockResolvedValue('granted')
    mocks.registerServiceWorker.mockResolvedValue({ scope: '/' })
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: mocks.requestPermission,
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: mocks.registerServiceWorker },
    })
  })

  it('invalidates FCM and compensates a late server registration owned by A after switching to B', async () => {
    let completeRegistration!: (id: string) => void
    mocks.registerPushToken.mockImplementationOnce(() => new Promise<string>((resolve) => {
      completeRegistration = resolve
    }))
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const sessionA = captureAuthenticatedSession()
    const { result } = renderHook(() => useWebPush(), { wrapper })

    let registration!: Promise<string>
    act(() => {
      registration = result.current.requestPermissionAndRegister()
    })
    await waitFor(() => expect(mocks.registerPushToken).toHaveBeenCalledWith({
      token: 'fcm-token-a',
      platform: 'Web',
      deviceName: navigator.userAgent,
    }, sessionA))

    await act(async () => {
      await replaceAuthenticatedSession(session('user-b', 'org-b'), {
        expectedSession: sessionA,
      })
    })
    completeRegistration('push-registration-a')

    await expect(registration).resolves.toBe('default')
    await waitFor(() => {
      expect(mocks.deleteToken).toHaveBeenCalledWith({ name: 'messaging' })
      expect(mocks.deletePushTokenForOwner).toHaveBeenCalledWith(
        'push-registration-a',
        sessionA,
      )
    })
    expect(getPushTokenId()).toBeNull()
    expect(useAuthStore.getState().userId).toBe('user-b')
  })

  it('serializes an attempted backend A-after-B write so org B remains the final owner', async () => {
    let completeBackendMutationA!: () => void
    const backendMutationOrder: string[] = []
    let backendOwner: string | null = null
    mocks.registerPushToken
      .mockImplementationOnce(() => new Promise<string>((resolve) => {
        completeBackendMutationA = () => {
          backendOwner = 'same-user/org-a'
          backendMutationOrder.push(backendOwner)
          resolve('shared-registration')
        }
      }))
      .mockImplementationOnce(async () => {
        backendOwner = 'same-user/org-b'
        backendMutationOrder.push(backendOwner)
        return 'shared-registration'
      })
    useAuthStore.getState().setTokens(session('same-user', 'org-a'))
    const sessionA = captureAuthenticatedSession()
    const { result } = renderHook(() => useWebPush(), { wrapper })

    let registrationA!: Promise<string>
    act(() => {
      registrationA = result.current.requestPermissionAndRegister()
    })
    await waitFor(() => expect(mocks.registerPushToken).toHaveBeenCalledTimes(1))

    await act(async () => {
      await replaceAuthenticatedSession(session('same-user', 'org-b'), {
        expectedSession: sessionA,
      })
    })
    const sessionB = captureAuthenticatedSession()
    let registrationB!: Promise<string>
    act(() => {
      registrationB = result.current.requestPermissionAndRegister()
    })

    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(2))
    // B was initiated while backend mutation A is still pending. Its POST is
    // deliberately withheld, preventing the otherwise possible B-then-A
    // backend write order.
    expect(mocks.registerPushToken).toHaveBeenCalledTimes(1)
    expect(backendOwner).toBeNull()

    await act(async () => {
      completeBackendMutationA()
      await expect(registrationA).resolves.toBe('default')
      await expect(registrationB).resolves.toBe('registered')
    })
    expect(mocks.registerPushToken).toHaveBeenNthCalledWith(2, {
      token: 'fcm-token-a',
      platform: 'Web',
      deviceName: navigator.userAgent,
    }, sessionB)
    expect(getPushTokenId()).toBe('shared-registration')
    await waitFor(() => expect(result.current.status).toBe('registered'))
    expect(mocks.getToken).toHaveBeenCalledTimes(2)
    expect(mocks.deleteToken.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getToken.mock.invocationCallOrder[1]!,
    )

    expect(mocks.deletePushTokenForOwner).not.toHaveBeenCalled()
    expect(backendMutationOrder).toEqual(['same-user/org-a', 'same-user/org-b'])
    expect(backendOwner).toBe('same-user/org-b')
    expect(getPushTokenId()).toBe('shared-registration')
    await waitFor(() => expect(result.current.status).toBe('registered'))
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'same-user',
      organizationId: 'org-b',
    })
  })

  it('cleans the deferred org A registration when the queued org B registration fails', async () => {
    let completeBackendMutationA!: () => void
    let backendOwner: string | null = null
    mocks.registerPushToken
      .mockImplementationOnce(() => new Promise<string>((resolve) => {
        completeBackendMutationA = () => {
          backendOwner = 'same-user/org-a'
          resolve('shared-registration')
        }
      }))
      .mockRejectedValueOnce(new Error('org B registration failed'))
    mocks.deletePushTokenForOwner.mockImplementationOnce(async (id, owner) => {
      expect(id).toBe('shared-registration')
      expect(owner).toMatchObject({
        userId: 'same-user',
        organizationId: 'org-a',
      })
      backendOwner = null
    })

    useAuthStore.getState().setTokens(session('same-user', 'org-a'))
    const sessionA = captureAuthenticatedSession()
    const { result } = renderHook(() => useWebPush(), { wrapper })

    let registrationA!: Promise<string>
    act(() => {
      registrationA = result.current.requestPermissionAndRegister()
    })
    await waitFor(() => expect(mocks.registerPushToken).toHaveBeenCalledTimes(1))

    await act(async () => {
      await replaceAuthenticatedSession(session('same-user', 'org-b'), {
        expectedSession: sessionA,
      })
    })
    const sessionB = captureAuthenticatedSession()
    let registrationB!: Promise<string>
    act(() => {
      registrationB = result.current.requestPermissionAndRegister()
    })

    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(2))
    expect(mocks.registerPushToken).toHaveBeenCalledTimes(1)
    expect(backendOwner).toBeNull()

    await act(async () => {
      completeBackendMutationA()
      await expect(registrationA).resolves.toBe('default')
      await expect(registrationB).resolves.toBe('granted')
    })

    expect(mocks.registerPushToken).toHaveBeenNthCalledWith(2, {
      token: 'fcm-token-a',
      platform: 'Web',
      deviceName: navigator.userAgent,
    }, sessionB)
    expect(mocks.deletePushTokenForOwner).toHaveBeenCalledTimes(1)
    expect(mocks.deletePushTokenForOwner).toHaveBeenCalledWith(
      'shared-registration',
      sessionA,
    )
    expect(backendOwner).toBeNull()
    expect(getPushTokenId()).toBeNull()
    await waitFor(() => expect(result.current.status).toBe('granted'))
    expect(mocks.deleteToken).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'same-user',
      organizationId: 'org-b',
    })
  })
})
