import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr'
import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { AGENTS_QUERY_KEY, type Agent } from '../agents'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import { env } from '../../shared/lib/env'
import { parseNotificationPayload } from './notification-types'
import { showNotificationToast } from './notification-toast'
import { signalrLog } from './signalr-log'
import { useNotificationInvalidation } from './use-notification-invalidation'
import { usePendingAlerts } from './use-pending-alerts'
import { claimNotificationEvent } from './notification-deduplication'
import { resolveNotificationPayload } from './notification-resolution'

/** Notification types that demand the user's attention (sound + tab flash). */
const ATTENTION_TYPES = new Set([
  'grant_pending',
  'agent_pending',
  'credential_stale',
])

/** Initial-connect retry backoff (ms), capped. Used only for the FIRST start —
 *  drops after a successful start are handled by `withAutomaticReconnect`. */
const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000]

/**
 * Owns the single SignalR hub connection for the session.
 *
 * Lifecycle is sequenced so start/stop never race — critical under React
 * StrictMode (dev double-mount), where the first mount's cleanup would
 * otherwise abort an in-flight negotiate ("stopped during negotiation"):
 *
 * - A single in-flight operation chain (`opRef`) serialises every start/stop:
 *   each transition awaits the previous one, so a new mount's `start()` only
 *   runs after the prior mount's `stop()` has fully settled.
 * - Initial connect is retried with backoff while we still want to connect —
 *   `withAutomaticReconnect` only covers drops AFTER a successful start.
 * - An aborted start (negotiate cancelled by a concurrent stop) is treated as
 *   benign: we don't log it as fatal and we don't get stuck disconnected,
 *   because `evaluate()` re-runs and re-establishes the connection.
 *
 * JWT is supplied via `accessTokenFactory`, read fresh from the auth store on
 * every (re)connect (token refresh is picked up without rebuilding). SignalR
 * appends it as `?access_token=` for the WebSocket transport.
 *
 * Mount inside the authenticated layout — never at the app root.
 */
export function SignalRProvider({ children }: { children: ReactNode }) {
  const invalidate = useNotificationInvalidation()
  const { notifyPending } = usePendingAlerts()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Keep the latest handler in a ref so the connection's message subscription
  // always calls the current closure without needing to be re-registered.
  const handlerRef = useRef<(type: string, raw: unknown) => void>(() => {})
  useEffect(() => {
    handlerRef.current = (type: string, raw: unknown) => {
      // Visible confirmation that an event actually reached the client — the
      // key diagnostic for "connection up but list not refreshing".
      signalrLog.info(`event received: ${type}`)
      const payload = parseNotificationPayload(raw)
      if (!payload) {
        signalrLog.warn('payload failed to parse — ignored')
        return
      }
      if (payload.type !== type) {
        signalrLog.warn('notification type mismatch — ignored')
        return
      }
      if (!claimNotificationEvent(payload)) return
      const resolved = resolveNotificationPayload(payload, {
        vaults: useMemberSyncStore.getState().vaults,
        agents: new Map((queryClient.getQueryData<Agent[]>(AGENTS_QUERY_KEY) ?? [])
          .map((agent) => [agent.agentId, agent])),
      })
      showNotificationToast(resolved, () => navigate({ to: '/inbox' }))
      invalidate(payload)
      // Attention-worthy pending events also chime + flash the tab title.
      if (ATTENTION_TYPES.has(payload.type)) {
        notifyPending()
      }
    }
  }, [invalidate, notifyPending, navigate, queryClient])

  useEffect(() => {
    // `disposed` flips on unmount so any in-flight retry/start bails out and
    // tears down instead of leaving a stray live connection.
    let disposed = false
    let connection: HubConnection | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    // Serialises start/stop — every transition chains onto the previous op so
    // they can never overlap (the root-cause fix for the negotiation race).
    let op: Promise<void> = Promise.resolve()

    function wantsConnection(): boolean {
      const { accessToken, isVaultLocked } = useAuthStore.getState()
      return Boolean(accessToken) && !isVaultLocked
    }

    function buildConnection(): HubConnection {
      const conn = new HubConnectionBuilder()
        .withUrl(env.signalrHubUrl, {
          accessTokenFactory: () => useAuthStore.getState().accessToken ?? '',
        })
        .withAutomaticReconnect()
        // In DEV surface SignalR's own transport diagnostics (negotiate 401,
        // CORS, transport fallback) — the decisive signal when the connection
        // won't come up. Quiet in production.
        .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
        .build()

      // type + payload — server pushes both; we forward both so the handler can
      // log the type even when the payload body is unparseable.
      conn.on('ReceiveNotification', (type: string, payload: unknown) => {
        handlerRef.current(type, payload)
      })

      // Lifecycle diagnostics — make drops/reconnects visible instead of silent.
      conn.onreconnecting((err) =>
        signalrLog.warn('reconnecting…', err?.message ?? ''),
      )
      conn.onreconnected(() => signalrLog.info('reconnected'))
      conn.onclose((err) =>
        signalrLog.warn('connection closed', err?.message ?? ''),
      )
      return conn
    }

    function clearRetry() {
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    async function doStart(attempt: number): Promise<void> {
      // State may have changed while earlier ops in the chain settled.
      if (disposed || !wantsConnection() || connection) return

      const conn = buildConnection()
      connection = conn
      signalrLog.info(`connecting to ${env.signalrHubUrl} (attempt ${attempt + 1})`)
      try {
        await conn.start()
        if (disposed || !wantsConnection()) {
          // Unmounted / state flipped during negotiate — tear this one down.
          connection = null
          await conn.stop()
          return
        }
        signalrLog.info('connected — joined organization group, awaiting events')
      } catch (err) {
        // Start failed or was aborted mid-negotiate. Not fatal — drop the
        // handle and retry with backoff while we still want a connection.
        connection = null
        if (disposed || !wantsConnection()) return
        const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]
        signalrLog.warn(
          `start failed (${(err as Error)?.message ?? 'unknown'}) — retrying in ${delay}ms`,
        )
        clearRetry()
        retryTimer = setTimeout(() => {
          op = op.then(() => doStart(attempt + 1))
        }, delay)
      }
    }

    async function doStop(): Promise<void> {
      clearRetry()
      const conn = connection
      connection = null
      if (conn && conn.state !== HubConnectionState.Disconnected) {
        // Awaited so a subsequent start (next chained op) can't begin until the
        // socket is fully closed.
        await conn.stop()
      }
    }

    function evaluate() {
      if (wantsConnection()) {
        op = op.then(() => doStart(0))
      } else {
        op = op.then(() => doStop())
      }
    }

    evaluate()
    // React to login/logout/unlock/lock without rebuilding the effect.
    const unsubscribe = useAuthStore.subscribe(evaluate)

    return () => {
      disposed = true
      unsubscribe()
      clearRetry()
      // Chain the final stop so it waits for any in-flight start to settle
      // before tearing down — prevents the StrictMode negotiation abort.
      op = op.then(() => doStop())
    }
  }, [])

  return <>{children}</>
}
