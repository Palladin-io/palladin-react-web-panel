import { env } from './env'

const UI_EVENTS = new Set([
  'vault:password-generated', 'recovery:recovery-started', 'recovery:recovery-failed',
  'agents:browser-pairing-approval-submitted', 'agents:browser-pairing-rejection-submitted',
  'search:search-result-selected', 'entry:detail-tab-switched', 'unlock:vault-unlocked', 'unlock:unlock-failed',
  'onboarding:recovery-key-confirmed', 'billing:upgrade-prompt-shown', 'billing:upgrade-prompt-clicked',
  'vault:create-wizard-opened', 'vault:create-wizard-failed', 'vault:create-entry-wizard-opened',
  'vault:create-entry-wizard-failed', 'vault:import-failed', 'vault:entry-reveal-opened',
  'dashboard:onboarding-mobile-clicked', 'dashboard:onboarding-mobile-skipped',
  'dashboard:onboarding-entry-clicked', 'dashboard:onboarding-agent-clicked', 'dashboard:onboarding-skipped',
  'agents:setup-message-copied', 'auth:verification-email-resent',
])

interface AnalyticsOptions {
  projectKey: string
  host: string
  released: boolean
  request?: typeof fetch
  now?: () => number
  uuid?: () => string
  online?: () => boolean
}

export function createAnalytics({ projectKey, host, released, request = fetch, now = Date.now,
  uuid = () => crypto.randomUUID(), online = () => navigator.onLine }: AnalyticsOptions) {
  let userId: string | null = null
  let validUntil = 0
  let sessionId: string | null = null
  let expiry: ReturnType<typeof setTimeout> | undefined
  let activationAllowed: (() => boolean) | null = null
  const pending = new Set<AbortController>()
  const configured = released && !!projectKey && host.replace(/\/$/, '') === 'https://eu.i.posthog.com'

  function reset() {
    userId = null
    validUntil = 0
    sessionId = null
    activationAllowed = null
    clearTimeout(expiry)
    for (const controller of pending) controller.abort()
    pending.clear()
  }

  function enabled() {
    if (!configured || !userId || now() >= validUntil || !activationAllowed?.() || !online()) {
      reset()
      return false
    }
    return true
  }

  function authorize(accountId: string, expiresAt: number, consentAllowed: () => boolean) {
    if (userId !== accountId) reset()
    userId = accountId
    validUntil = expiresAt
    activationAllowed = consentAllowed
    if (!enabled()) return
    clearTimeout(expiry)
    expiry = setTimeout(reset, Math.max(0, expiresAt - now()))
  }

  function send(event: string, properties: Record<string, string | boolean>) {
    if (!enabled() || pending.size >= 5) return
    sessionId ??= uuid()
    const distinctId = userId
    const session = sessionId
    const controller = new AbortController()
    pending.add(controller)
    const timeout = setTimeout(() => controller.abort(), 5000)
    void Promise.resolve().then(() => {
      if (controller.signal.aborted || !enabled() || userId !== distinctId) return
      return request('https://eu.i.posthog.com/i/v0/e/', {
        method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: projectKey, event, distinct_id: distinctId,
          properties: { ...properties, $session_id: session, $process_person_profile: false, $geoip_disable: true },
          timestamp: new Date(now()).toISOString(),
        }),
      })
    }).catch(() => undefined).finally(() => { clearTimeout(timeout); pending.delete(controller) })
  }

  return {
    authorize, reset,
    capture(module: string, event: string, _properties?: Record<string, unknown>) {
      // Existing callers may supply properties. This transport deliberately accepts none.
      void _properties
      if (UI_EVENTS.has(`${module}:${event}`)) send(`fe:${module}:${event}`, {})
    },
    pageview(routeId: string) { send('$pageview', { route: routeId }) },
    getSessionId(): string | undefined { return enabled() ? sessionId ?? undefined : undefined },
  }
}

export const analytics = createAnalytics({
  projectKey: env.posthogKey, host: env.posthogHost, released: env.clientAnalyticsReleased,
})
