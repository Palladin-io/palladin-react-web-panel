import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock the SignalR builder so we can control start()/stop() timing. ---
interface FakeConnection {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  onreconnecting: ReturnType<typeof vi.fn>
  onreconnected: ReturnType<typeof vi.fn>
  onclose: ReturnType<typeof vi.fn>
  state: string
}

const connections: FakeConnection[] = []
const configuredLogLevels: number[] = []
let startBehaviour: () => Promise<void> = () => Promise.resolve()

function makeConnection(): FakeConnection {
  const conn: FakeConnection = {
    state: 'Disconnected',
    on: vi.fn(),
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    onclose: vi.fn(),
    start: vi.fn(() =>
      startBehaviour().then(() => {
        conn.state = 'Connected'
      }),
    ),
    stop: vi.fn(() => {
      conn.state = 'Disconnected'
      return Promise.resolve()
    }),
  }
  connections.push(conn)
  return conn
}

vi.mock('@microsoft/signalr', () => {
  class HubConnectionBuilder {
    withUrl() {
      return this
    }
    withAutomaticReconnect() {
      return this
    }
    configureLogging(level: number) {
      configuredLogLevels.push(level)
      return this
    }
    build() {
      return makeConnection()
    }
  }
  return {
    HubConnectionBuilder,
    HubConnectionState: { Disconnected: 'Disconnected', Connected: 'Connected' },
    LogLevel: { None: 6 },
  }
})

// Auth store: report "wants connection" (token present, vault unlocked).
vi.mock('../auth', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: 'jwt', isVaultLocked: false }),
    subscribe: () => () => {},
  },
}))

vi.mock('../../shared/lib/env', () => ({ env: { signalrHubUrl: 'http://x/hub', apiUrl: 'https://api.example.test' } }))
vi.mock('./use-notification-invalidation', () => ({
  useNotificationInvalidation: () => vi.fn(),
}))
vi.mock('./use-pending-alerts', () => ({
  usePendingAlerts: () => ({ notifyPending: vi.fn(), reset: vi.fn() }),
}))

import { SignalRProvider } from './signalr-provider'

const flush = () => new Promise((r) => setTimeout(r, 0))

function renderProvider() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SignalRProvider><div /></SignalRProvider>
    </QueryClientProvider>,
  )
}

describe('SignalRProvider lifecycle', () => {
  beforeEach(() => {
    connections.length = 0
    configuredLogLevels.length = 0
    startBehaviour = () => Promise.resolve()
  })

  afterEach(() => vi.restoreAllMocks())

  it('establishes exactly one live connection on mount', async () => {
    renderProvider()
    await flush()
    const started = connections.filter((c) => c.start.mock.calls.length > 0)
    expect(started).toHaveLength(1)
    expect(started[0].state).toBe('Connected')
    expect(configuredLogLevels).toEqual([6])
  })

  it('does not throw and leaves no live connection after mount→unmount with a slow start (StrictMode race)', async () => {
    // start() resolves only after a tick — unmount happens mid-negotiate.
    let resolveStart: (() => void) | null = null
    startBehaviour = () =>
      new Promise<void>((res) => {
        resolveStart = res
      })

    const { unmount } = renderProvider()
    // Unmount while the first start() is still pending (negotiation in flight).
    unmount()
    // Now let the in-flight start settle, then the chained stop runs.
    resolveStart?.()
    await flush()
    await flush()

    // The connection that started must have been stopped (not left dangling).
    const started = connections.filter((c) => c.start.mock.calls.length > 0)
    for (const c of started) {
      expect(c.stop).toHaveBeenCalled()
      expect(c.state).toBe('Disconnected')
    }
  })

  it('retries the initial connect after a failed start', async () => {
    vi.useFakeTimers()
    let fail = true
    startBehaviour = () =>
      fail ? Promise.reject(new Error('negotiate aborted')) : Promise.resolve()

    renderProvider()
    // Let the first (failing) start settle.
    await vi.advanceTimersByTimeAsync(0)
    expect(connections.some((c) => c.start.mock.calls.length > 0)).toBe(true)

    // Next attempt should succeed; advance past the first backoff (1s).
    fail = false
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(0)

    const connected = connections.filter((c) => c.state === 'Connected')
    expect(connected.length).toBeGreaterThanOrEqual(1)
    vi.useRealTimers()
  })
})
