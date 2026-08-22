import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureWebsiteIcons,
  ensureWebsiteIconsUntilSettled,
  ensureWebsiteIconsWithin,
  normalizePublicHostname,
} from './public-assets-api'

afterEach(() => vi.unstubAllGlobals())

describe('normalizePublicHostname', () => {
  it.each([
    ['https://Accounts.Example.com/login?token=secret', 'accounts.example.com'],
    ['example.com/path', 'example.com'],
    ['https://online.mbank.pl/', 'online.mbank.pl'],
    ['https://signup.heroku.com/confirmation', 'signup.heroku.com'],
  ])('returns only the normalized hostname for %s', (input, expected) => {
    expect(normalizePublicHostname(input)).toBe(expected)
  })

  it.each([
    'localhost',
    'http://127.0.0.1/a',
    'http://[::1]/',
    'service.local',
    'intranet',
    'https://invalid_host.example.com',
  ]) (
    'rejects non-public host %s',
    (input) => expect(normalizePublicHostname(input)).toBeNull(),
  )
})

describe('ensureWebsiteIcons', () => {
  it('reuses a reserved immutable URL instead of ensuring the same hostname twice', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[] }
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({
          hostname,
          status: 'ready',
          asset: {
            id: '11111111-1111-4111-8111-111111111111',
            type: 'websiteIcon',
            name: hostname,
            url: 'https://assets.palladin.io/published/website-icon/11111111111141118111111111111111/1.png',
            revision: 1,
          },
        })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await ensureWebsiteIcons(['cache-once.example.com'])
    await ensureWebsiteIcons(['cache-once.example.com'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves cached hosts when another reservation exceeds the save bound', async () => {
    const cachedHostname = 'cached-before-timeout.example.com'
    const pendingHostname = 'pending-at-timeout.example.com'
    const fetchMock = vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[] }
      if (body.hostnames.includes(pendingHostname)) {
        return await new Promise<Response>(() => undefined)
      }
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({
          hostname,
          status: 'ready',
          asset: {
            id: '22222222-2222-4222-8222-222222222222',
            type: 'websiteIcon',
            name: hostname,
            url: 'https://assets.palladin.io/published/website-icon/22222222222242228222222222222222/1.png',
            revision: 1,
          },
        })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await ensureWebsiteIcons([cachedHostname])
    const result = await ensureWebsiteIconsWithin([cachedHostname, pendingHostname], 1)

    expect(result.get(cachedHostname)?.id).toBe('22222222-2222-4222-8222-222222222222')
    expect(result.has(pendingHostname)).toBe(false)
  })

  it('polls during the explicit save window and returns an asset only after it is ready', async () => {
    vi.useFakeTimers()
    try {
      const hostname = 'ready-after-acquisition.example.com'
      let calls = 0
      vi.stubGlobal('fetch', vi.fn(async () => {
        calls += 1
        return new Response(JSON.stringify({
          items: [{
            hostname,
            status: calls === 1 ? 'pending' : 'ready',
            asset: calls === 1 ? null : {
              id: '44444444-4444-4444-8444-444444444444',
              type: 'websiteIcon',
              name: hostname,
              url: 'https://assets.palladin.io/published/website-icon/ready.png',
              revision: 1,
            },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }))

      const pending = ensureWebsiteIconsWithin([hostname], 2_000)
      await vi.advanceTimersByTimeAsync(1_000)
      const result = await pending

      expect(calls).toBe(2)
      expect(result.get(hostname)?.id).toBe('44444444-4444-4444-8444-444444444444')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports ready icon progress during the bounded wait', async () => {
    const hostname = 'progress.example.com'
    const onProgress = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      items: [{
        hostname,
        status: 'ready',
        asset: {
          id: '55555555-5555-4555-8555-555555555555',
          type: 'websiteIcon',
          name: hostname,
          url: 'https://assets.palladin.io/published/website-icon/progress.png',
          revision: 1,
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    await ensureWebsiteIconsWithin([hostname], 2_000, onProgress)

    expect(onProgress).toHaveBeenNthCalledWith(1, 0, 1)
    expect(onProgress).toHaveBeenLastCalledWith(1, 1)
  })

  it('waits past the former batch deadline until every queued icon is terminal', async () => {
    vi.useFakeTimers()
    try {
      const hostname = 'slow-queue.example.com'
      let calls = 0
      vi.stubGlobal('fetch', vi.fn(async () => {
        calls += 1
        const ready = calls === 17
        return new Response(JSON.stringify({
          items: [{
            hostname,
            status: ready ? 'ready' : 'pending',
            asset: ready ? {
              id: '77777777-7777-4777-8777-777777777777',
              type: 'websiteIcon',
              name: hostname,
              url: 'https://assets.palladin.io/published/website-icon/slow.png',
              revision: 1,
            } : null,
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }))

      const pending = ensureWebsiteIconsUntilSettled([hostname])
      await vi.advanceTimersByTimeAsync(48_000)
      const result = await pending

      expect(calls).toBe(17)
      expect(result.has(hostname)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('respects Retry-After instead of hammering ensure after a 429', async () => {
    vi.useFakeTimers()
    try {
      const hostname = 'rate-limited.example.com'
      let calls = 0
      vi.stubGlobal('fetch', vi.fn(async () => {
        calls += 1
        if (calls === 2) {
          return new Response(null, {
            status: 429,
            headers: { 'retry-after': '10' },
          })
        }
        const ready = calls === 3
        return new Response(JSON.stringify({
          items: [{
            hostname,
            status: ready ? 'ready' : 'pending',
            asset: ready ? {
              id: '88888888-8888-4888-8888-888888888888',
              type: 'websiteIcon',
              name: hostname,
              url: 'https://assets.palladin.io/published/website-icon/rate-limited.png',
              revision: 1,
            } : null,
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }))

      const pending = ensureWebsiteIconsUntilSettled([hostname])
      await vi.advanceTimersByTimeAsync(3_000)
      expect(calls).toBe(2)

      await vi.advanceTimersByTimeAsync(9_999)
      expect(calls).toBe(2)

      await vi.advanceTimersByTimeAsync(1)
      const result = await pending
      expect(result.has(hostname)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts failed icons as completed and stops polling them', async () => {
    const hostname = 'no-icon.example.com'
    const onProgress = vi.fn()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      items: [{ hostname, status: 'failed', asset: null }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ensureWebsiteIconsWithin([hostname], 15_000, onProgress)

    expect(result).toEqual(new Map())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenLastCalledWith(1, 1)
  })

  it('revalidates a previously failed icon during a later preparation attempt', async () => {
    const hostname = 'available-after-failure.example.com'
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({
        items: [{
          hostname,
          status: calls === 1 ? 'failed' : 'ready',
          asset: calls === 1 ? null : {
            id: '66666666-6666-4666-8666-666666666666',
            type: 'websiteIcon',
            name: hostname,
            url: 'https://assets.palladin.io/published/website-icon/recovered.png',
            revision: 1,
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await ensureWebsiteIconsWithin([hostname], 2_000)).toEqual(new Map())
    const recovered = await ensureWebsiteIconsWithin([hostname], 2_000)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(recovered.get(hostname)?.id).toBe('66666666-6666-4666-8666-666666666666')
  })

  it('preserves a successful reservation page while a sibling page is still pending', async () => {
    const hostnames = Array.from(
      { length: 501 },
      (_, index) => `partial-page-${index}.example.com`,
    )
    const pendingHostname = hostnames.at(-1)!
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[] }
      if (body.hostnames.includes(pendingHostname)) {
        return await new Promise<Response>(() => undefined)
      }
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({
          hostname,
          status: 'ready',
          asset: {
            id: '33333333-3333-4333-8333-333333333333',
            type: 'websiteIcon',
            name: hostname,
            url: 'https://assets.palladin.io/published/website-icon/33333333333343338333333333333333/1.png',
            revision: 1,
          },
        })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    const result = await ensureWebsiteIconsWithin(hostnames, 10)

    expect(result.get(hostnames[0])?.id).toBe('33333333-3333-4333-8333-333333333333')
    expect(result.has(pendingHostname)).toBe(false)
  })

  it('sends all 539 imported hosts without dropping the final page', async () => {
    const sizes: number[] = []
    const fetchMock = vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[] }
      sizes.push(body.hostnames.length)
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({ hostname, status: 'pending', asset: null })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await ensureWebsiteIcons(Array.from({ length: 539 }, (_, index) => `example-${index}.com`))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sizes.sort((left, right) => right - left)).toEqual([500, 39])
  })

  it('pages a 5,039-host import without imposing a total client cap', async () => {
    const sizes: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[] }
      sizes.push(body.hostnames.length)
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({ hostname, status: 'pending', asset: null })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await ensureWebsiteIcons(Array.from(
      { length: 5_039 }, (_, index) => `host-${index}.example.com`,
    ))

    expect(sizes).toHaveLength(11)
    expect(sizes.filter((size) => size === 500)).toHaveLength(10)
    expect(sizes).toContain(39)
  })
})
