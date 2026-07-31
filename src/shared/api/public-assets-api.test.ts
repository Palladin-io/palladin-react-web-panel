import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureWebsiteIcons, normalizePublicHostname } from './public-assets-api'

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

  it('sends all 539 imported hosts without dropping the final page', async () => {
    const sizes: number[] = []
    const fetchMock = vi.fn(async (request: Request) => {
      const body = await request.clone().json() as { hostnames: string[] }
      sizes.push(body.hostnames.length)
      return new Response(JSON.stringify({
        items: body.hostnames.map((hostname) => ({ hostname, asset: null })),
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
        items: body.hostnames.map((hostname) => ({ hostname, asset: null })),
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
