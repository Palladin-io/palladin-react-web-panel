import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr'
import { useEffect, useRef, type ReactNode } from 'react'
import { useAuthStore } from '../auth'
import { env } from '../../shared/lib/env'
import { parseNotificationPayload } from './notification-types'
import { showNotificationToast } from './notification-toast'
import { useNotificationInvalidation } from './use-notification-invalidation'

/**
 * Owns the single SignalR hub connection for the session.
 *
 * - One connection per session, held in a ref (survives re-renders).
 * - JWT is supplied via `accessTokenFactory`, which reads the *current* token
 *   from the auth store on every (re)connect — so a token refreshed mid-session
 *   is picked up on the next reconnect without rebuilding the connection.
 *   SignalR appends it as `?access_token=` for the WebSocket transport, which
 *   cannot send an Authorization header.
 * - Auto-reconnect with the built-in backoff.
 * - Started only while authenticated AND the vault is unlocked; stopped on
 *   logout / lock and on unmount.
 *
 * Mount this inside the authenticated layout — never at the app root, where the
 * user may be unauthenticated.
 */
export function SignalRProvider({ children }: { children: ReactNode }) {
  const invalidate = useNotificationInvalidation()
  const connectionRef = useRef<HubConnection | null>(null)

  // Keep the latest handler in a ref so the connection's message subscription
  // always calls the current closure without needing to be re-registered.
  const handlerRef = useRef<(raw: unknown) => void>(() => {})
  useEffect(() => {
    handlerRef.current = (raw: unknown) => {
      const payload = parseNotificationPayload(raw)
      if (!payload) return
      showNotificationToast(payload)
      invalidate(payload)
    }
  }, [invalidate])

  useEffect(() => {
    let active = true

    function buildConnection(): HubConnection {
      const connection = new HubConnectionBuilder()
        .withUrl(env.signalrHubUrl, {
          accessTokenFactory: () => useAuthStore.getState().accessToken ?? '',
        })
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build()

      // type + payload — server pushes both; we only act on the payload object.
      connection.on('ReceiveNotification', (_type: string, payload: unknown) => {
        handlerRef.current(payload)
      })

      return connection
    }

    async function start() {
      if (connectionRef.current) return
      const connection = buildConnection()
      connectionRef.current = connection
      try {
        await connection.start()
        if (!active) {
          // Component unmounted (or state flipped) while connecting — tear down.
          await connection.stop()
          connectionRef.current = null
        }
      } catch {
        // Initial connect failed (server down, network). Drop the handle so a
        // later state change can retry; automatic reconnect only covers drops
        // after a successful start, not the first attempt.
        connectionRef.current = null
      }
    }

    async function stop() {
      const connection = connectionRef.current
      connectionRef.current = null
      if (connection && connection.state !== HubConnectionState.Disconnected) {
        await connection.stop()
      }
    }

    function evaluate() {
      const { accessToken, isVaultLocked } = useAuthStore.getState()
      const shouldConnect = Boolean(accessToken) && !isVaultLocked
      if (shouldConnect) {
        void start()
      } else {
        void stop()
      }
    }

    evaluate()
    // React to login/logout/unlock/lock without rebuilding the effect.
    const unsubscribe = useAuthStore.subscribe(evaluate)

    return () => {
      active = false
      unsubscribe()
      void stop()
    }
  }, [])

  return <>{children}</>
}
