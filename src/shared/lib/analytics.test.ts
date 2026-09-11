import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalytics } from './analytics'

describe('consent-gated analytics transport', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T12:00:00Z')) })
  afterEach(() => vi.useRealTimers())
  function setup(overrides: Partial<Parameters<typeof createAnalytics>[0]> = {}) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    const client = createAnalytics({ projectKey: 'test-project', host: 'https://eu.i.posthog.com',
      released: true, request, uuid: () => 'memory-session', online: () => true, ...overrides })
    return { client, request, authorize: () => client.authorize('account-id', Date.now() + 60_000, () => true) }
  }
  it('sends nothing without consent, local activation or release configuration', async () => {
    for (const options of [{}, { released: false }, { projectKey: '' }, { host: 'https://us.i.posthog.com' }]) {
      const { client, request } = setup(options)
      if (Object.keys(options).length) client.authorize('account', Date.now() + 60_000, () => true)
      client.pageview('/settings/privacy')
      client.capture('vault', 'password-generated')
      await vi.advanceTimersByTimeAsync(0)
      expect(request).not.toHaveBeenCalled()
      client.reset()
    }
    const { client, request } = setup()
    client.authorize('account', Date.now() + 60_000, () => false)
    client.pageview('/settings/privacy')
    await vi.advanceTimersByTimeAsync(0)
    expect(request).not.toHaveBeenCalled()
  })
  it('sends only reviewed events and final value-free payloads to the EU capture endpoint', async () => {
    const { client, request, authorize } = setup()
    authorize()
    client.capture('vault', 'password-generated', { password: 'never-send', url: 'https://secret.invalid', email: 'private@example.test' })
    client.capture('vault', 'vault-created')
    client.capture('auth', 'login-page-viewed')
    client.pageview('/_authenticated/vaults/$vaultId/entries/$entryId')
    await vi.advanceTimersByTimeAsync(0)
    expect(request).toHaveBeenCalledTimes(2)
    const [url, options] = request.mock.calls[0]
    expect(url).toBe('https://eu.i.posthog.com/i/v0/e/')
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
    expect(JSON.parse(options!.body as string)).toEqual({ api_key: 'test-project', event: 'fe:vault:password-generated',
      distinct_id: 'account-id', properties: { $session_id: 'memory-session', $process_person_profile: false, $geoip_disable: true },
      timestamp: '2026-09-11T12:00:00.000Z' })
    expect(JSON.parse(request.mock.calls[1][1]!.body as string).properties.route).toContain('$entryId')
    client.reset()
  })
  it('rechecks consent before sending and aborts in-flight work on withdrawal', async () => {
    const { client, request, authorize } = setup()
    authorize()
    client.capture('vault', 'password-generated')
    client.reset()
    await vi.advanceTimersByTimeAsync(0)
    expect(request).not.toHaveBeenCalled()
    request.mockImplementation(() => new Promise(() => {}))
    authorize()
    client.capture('vault', 'password-generated')
    await vi.advanceTimersByTimeAsync(0)
    const signal = request.mock.calls[0][1]!.signal!
    client.reset()
    expect(signal.aborted).toBe(true)
    expect(client.getSessionId()).toBeUndefined()
  })
  it('fails closed on stale, offline and cross-tab revocation; never replays dropped events', async () => {
    let online = true
    let activated = true
    const { client, request } = setup({ online: () => online })
    const authorize = () => client.authorize('account', Date.now() + 60_000, () => activated)
    authorize()
    await vi.advanceTimersByTimeAsync(60_000)
    client.capture('vault', 'password-generated')
    authorize()
    online = false
    client.capture('vault', 'password-generated')
    online = true
    authorize()
    activated = false
    client.capture('vault', 'password-generated')
    activated = true
    authorize()
    await vi.advanceTimersByTimeAsync(0)
    expect(request).not.toHaveBeenCalled()
    client.reset()
  })
  it('keeps its memory session across confirmations and clears it on account change', async () => {
    let count = 0
    const { client, authorize } = setup({ uuid: () => `session-${++count}` })
    authorize()
    client.capture('vault', 'password-generated')
    await vi.advanceTimersByTimeAsync(0)
    authorize()
    expect(client.getSessionId()).toBe('session-1')
    client.authorize('other-account', Date.now() + 60_000, () => true)
    expect(client.getSessionId()).toBeUndefined()
    client.reset()
  })
})
