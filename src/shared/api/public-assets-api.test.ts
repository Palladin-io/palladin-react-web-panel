import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizePublicHostname, resolveWebsiteIcons } from './public-assets-api'

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

describe('resolveWebsiteIcons', () => {
  it('sends all 539 imported hosts without dropping the final page', async () => {
    const sizes: number[] = []
    const acquisitionFlags: boolean[] = []
    const fetchMock = vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[]; acquireMissing: boolean }
      sizes.push(body.hostnames.length)
      acquisitionFlags.push(body.acquireMissing)
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({ hostname, asset: null })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await resolveWebsiteIcons(Array.from({ length: 539 }, (_, index) => `example-${index}.com`))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sizes.sort((left, right) => right - left)).toEqual([500, 39])
    expect(acquisitionFlags).toEqual([true, true])
  })

  it('supports read-only polling without enqueueing duplicate acquisition commands', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[]; acquireMissing: boolean }
      expect(body.acquireMissing).toBe(false)
      return new Response(JSON.stringify({ items: [{ hostname: 'example.com', asset: null }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await resolveWebsiteIcons(['example.com'], false)

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('pages a 50,039-host reconciliation without imposing a total client cap', async () => {
    const sizes: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[] }
      sizes.push(body.hostnames.length)
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({ hostname, asset: null })),
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await resolveWebsiteIcons(Array.from(
      { length: 50_039 }, (_, index) => `host-${index}.example.com`,
    ))

    expect(sizes).toHaveLength(101)
    expect(sizes.filter((size) => size === 500)).toHaveLength(100)
    expect(sizes).toContain(39)
  })
})
