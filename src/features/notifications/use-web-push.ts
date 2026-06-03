import { useCallback, useEffect, useState } from 'react'
import { env, isFirebaseConfigured } from '../../shared/lib/env'
import { getFirebaseMessaging } from '../../shared/push/firebase'
import { parseNotificationPayload } from './notification-types'
import { showNotificationToast } from './notification-toast'
import { registerPushToken } from './push-api'
import { clearPushTokenOnLogout, setPushTokenId } from './push-token-registry'
import { useNotificationInvalidation } from './use-notification-invalidation'

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
  const [status, setStatus] = useState<WebPushStatus>(() =>
    browserSupportsPush()
      ? (Notification.permission as WebPushStatus)
      : 'unsupported',
  )

  // Foreground message subscription. Only active once permission is granted.
  useEffect(() => {
    if (!browserSupportsPush() || status === 'unsupported' || status === 'denied') {
      return
    }
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    void (async () => {
      const messaging = await getFirebaseMessaging()
      if (!messaging || cancelled) return
      const { onMessage } = await import('firebase/messaging')
      if (cancelled) return
      unsubscribe = onMessage(messaging, (message) => {
        // FCM data messages carry our payload under `data`; the `notification`
        // block is only used by the SW for background display.
        const raw = message.data ?? message.notification
        const payload = parseNotificationPayload(raw)
        if (!payload) return
        showNotificationToast(payload)
        invalidate(payload)
      })
    })()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [status, invalidate])

  const requestPermissionAndRegister = useCallback(async (): Promise<WebPushStatus> => {
    if (!browserSupportsPush()) {
      setStatus('unsupported')
      return 'unsupported'
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      const next: WebPushStatus = permission === 'denied' ? 'denied' : 'default'
      setStatus(next)
      return next
    }
    setStatus('granted')

    const messaging = await getFirebaseMessaging()
    if (!messaging) {
      setStatus('unsupported')
      return 'unsupported'
    }

    const registration = await registerServiceWorker()
    const { getToken } = await import('firebase/messaging')
    const token = await getToken(messaging, {
      vapidKey: env.firebaseVapidKey,
      serviceWorkerRegistration: registration,
    })
    if (!token) {
      setStatus('granted')
      return 'granted'
    }

    const id = await registerPushToken({
      token,
      platform: 'Web',
      deviceName: navigator.userAgent,
    })
    setPushTokenId(id)
    setStatus('registered')
    return 'registered'
  }, [])

  /** Delete the registered token server-side. Safe to call when none exists. */
  const unregister = useCallback(async () => {
    await clearPushTokenOnLogout()
  }, [])

  return {
    status,
    isSupported: status !== 'unsupported',
    requestPermissionAndRegister,
    unregister,
  }
}
