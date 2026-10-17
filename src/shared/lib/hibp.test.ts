import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkPasswordPwned } from './hibp'

// Exercise the HTTP-panel boundary in every range-check scenario.
beforeEach(() => vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PWNED_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

function mockRange(body: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, text: () => Promise.resolve(body) }),
  )
}

describe('checkPasswordPwned', () => {
  it('sends only the 5-char SHA-1 prefix to HIBP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('') })
    vi.stubGlobal('fetch', fetchMock)

    await checkPasswordPwned('password')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6')
    // The full hash / password must never appear in the request.
    expect(url).not.toContain(PWNED_SUFFIX)
  })

  it('reports a breached password with its count', async () => {
    mockRange(`${PWNED_SUFFIX}:42\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5`)
    const result = await checkPasswordPwned('password')
    expect(result).toEqual({ pwned: true, count: 42 })
  })

  it('reports a clean password when the suffix is absent', async () => {
    mockRange('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5')
    const result = await checkPasswordPwned('password')
    expect(result).toEqual({ pwned: false, count: 0 })
  })

  it('treats a padded (count 0) entry as not breached', async () => {
    mockRange(`${PWNED_SUFFIX}:0`)
    const result = await checkPasswordPwned('password')
    expect(result).toEqual({ pwned: false, count: 0 })
  })

  it('returns null (unknown) when the lookup fails, never blocking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const result = await checkPasswordPwned('password')
    expect(result).toBeNull()
  })
})
