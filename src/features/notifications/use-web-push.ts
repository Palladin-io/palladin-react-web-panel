import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { env, isFirebaseConfigured } from '../../shared/lib/env'
import {
  authenticatedQueryKey,
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  useAuthStore,
} from '../auth'
import {
  deleteFirebaseToken,
  getFirebaseMessaging,
  getFirebaseToken,
  onFirebaseMessage,
} from '../../shared/push/firebase'
import { parseNotificationPayload } from './notification-types'
import { showNotificationToast } from './notification-toast'
import { registerPushToken } from './push-api'
import { clearPushTokenOnLogout, setPushTokenId } from './push-token-registry'
import {
  acquirePushFirebaseToken,
  beginPushRegistration,
  invalidateCurrentPushRegistration,
  invalidatePushRegistration,
  pushRegistrationOwnerIsCurrent,
  registerPushTokenForOwner,
} from './push-registration-owner'
import { useNotificationInvalidation } from './use-notification-invalidation'
import { AGENTS_QUERY_KEY, type Agent } from '../agents'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import { claimNotificationEvent } from './notification-deduplication'
import { resolveNotificationPayload } from './notification-resolution'
import { registerAuthenticatedPrincipalReset } from '../../shared/lib/authenticated-principal-reset'

export type WebPushStatus =
  | 'unsupported' // browser or config doesn't support push
  | 'default' // permission not yet requested
  | 'granted' // permission granted (token may be registering)
  | 'denied' // user blocked notifications
  | 'registered' // token registered with the backend

/**
 * Registers the service worker with the Firebase config in the query string.
 *
 * The SW runs outside the bundler so it cannot read `import.meta.env`; we pass
 * the (public, non-secret) messaging config as query params and the SW reads
 * them from its own `location.search`. The VAPID key is NOT passed here — it is
 * only used by `getToken` on the page side.
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const params = new URLSearchParams({
    apiKey: env.firebaseApiKey,
    authDomain: env.firebaseAuthDomain,
    projectId: env.firebaseProjectId,
    messagingSenderId: env.firebaseMessagingSenderId,
    appId: env.firebaseAppId,
  })
  return navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`,
  )
}

function browserSupportsPush(): boolean {
  return (
    isFirebaseConfigured() &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window
  )
}

/**
 * Web Push (FCM) lifecycle hook.
 *
 * Responsibilities:
 *  - Expose the current permission/registration `status` for UI gating.
 *  - `requestPermissionAndRegister()` — call from a deliberate user action
 *    (e.g. an "Enable notifications" button), never automatically on load.
 *  - Foreground messages → toast + query invalidation (mirrors SignalR).
 *  - `unregister()` — delete the server token (call on logout).
 *
 * Complementary to SignalR: SignalR covers the open tab, FCM covers the closed
 * tab (background, handled by the service worker).
 */
export function useWebPush() {
  const invalidate = useNotificationInvalidation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration)
  const [status, setStatus] = useState<WebPushStatus>(() =>
    browserSupportsPush()
      ? (Notification.permission as WebPushStatus)
      : 'unsupported',
  )

  useEffect(() => registerAuthenticatedPrincipalReset(() => {
    setStatus(browserSupportsPush()
      ? (Notification.permission as WebPushStatus)
      : 'unsupported')
  }), [])

  // Foreground message subscription. Only active once permission is granted.
  useEffect(() => {
    if (!browserSupportsPush() || status === 'unsupported' || status === 'denied') {
      return
    }
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    const session = captureAuthenticatedSession()

    void (async () => {
      const messaging = await getFirebaseMessaging()
      if (!messaging || cancelled) return
      if (cancelled) return
      const nextUnsubscribe = await onFirebaseMessage(messaging, (message) => {
        if (!authenticatedSessionMatches(session)) return
        // FCM data messages carry our payload under `data`; the `notification`
        // block is only used by the SW for background display.
        const raw = message.data ?? message.notification
        const payload = parseNotificationPayload(raw)
        if (!payload) return
        if (!claimNotificationEvent(payload)) return
        const unlocked = !useAuthStore.getState().isVaultLocked
        const resolved = unlocked
          ? resolveNotificationPayload(payload, {
              vaults: useMemberSyncStore.getState().vaults,
              agents: new Map((queryClient.getQueryData<Agent[]>(
                authenticatedQueryKey(AGENTS_QUERY_KEY),
              ) ?? [])
                .map((agent) => [agent.agentId, agent])),
            })
          : payload
        showNotificationToast(resolved, () => navigate({ to: '/inbox' }))
        invalidate(payload)
      })
      if (cancelled) {
        nextUnsubscribe()
        return
      }
      unsubscribe = nextUnsubscribe
    })()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [status, invalidate, navigate, queryClient, sessionGeneration])

  const requestPermissionAndRegister = useCallback(async (): Promise<WebPushStatus> => {
    const session = captureAuthenticatedSession()
    if (!browserSupportsPush()) {
      setStatus('unsupported')
      return 'unsupported'
    }
    const owner = beginPushRegistration(session)

    const permission = await Notification.requestPermission()
    if (!pushRegistrationOwnerIsCurrent(owner)) {
      await invalidatePushRegistration(owner)
      return 'default'
    }
    if (permission !== 'granted') {
      await invalidatePushRegistration(owner)
      const next: WebPushStatus = permission === 'denied' ? 'denied' : 'default'
      setStatus(next)
      return next
    }
    setStatus('granted')

    const messaging = await getFirebaseMessaging()
    if (!pushRegistrationOwnerIsCurrent(owner)) {
      await invalidatePushRegistration(owner)
      return 'default'
    }
    if (!messaging) {
      setStatus('unsupported')
      return 'unsupported'
    }

    const registration = await registerServiceWorker()
    if (!pushRegistrationOwnerIsCurrent(owner)) {
      await invalidatePushRegistration(owner)
      return 'default'
    }
    const token = await acquirePushFirebaseToken(
      owner,
      () => getFirebaseToken(messaging, {
        vapidKey: env.firebaseVapidKey,
        serviceWorkerRegistration: registration,
      }),
      () => deleteFirebaseToken(messaging),
    )
    if (!pushRegistrationOwnerIsCurrent(owner)) {
      await invalidatePushRegistration(owner)
      return 'default'
    }
    if (!token) {
      setStatus('granted')
      return 'granted'
    }

    let id: string | null
    try {
      id = await registerPushTokenForOwner(owner, () => registerPushToken({
        token,
        platform: 'Web',
        deviceName: navigator.userAgent,
      }, session))
    } catch {
      const failedCurrentOwner = pushRegistrationOwnerIsCurrent(owner)
      if (failedCurrentOwner) setPushTokenId(null, session)
      await invalidatePushRegistration(owner)
      if (failedCurrentOwner && authenticatedSessionMatches(session)) {
        setStatus('granted')
        return 'granted'
      }
      return 'default'
    }
    if (!id || !pushRegistrationOwnerIsCurrent(owner) || !setPushTokenId(id, session)) {
      await invalidatePushRegistration(owner)
      return 'default'
    }
    setStatus('registered')
    return 'registered'
  }, [])

  /** Delete the registered token server-side. Safe to call when none exists. */
  const unregister = useCallback(async () => {
    const session = captureAuthenticatedSession()
    const deliveryCleanup = invalidateCurrentPushRegistration()
    const cleanup = clearPushTokenOnLogout(session)
    setStatus(browserSupportsPush()
      ? (Notification.permission as WebPushStatus)
      : 'unsupported')
    await Promise.all([deliveryCleanup, cleanup])
  }, [])

  return {
    status,
    isSupported: status !== 'unsupported',
    requestPermissionAndRegister,
    unregister,
  }
}
