import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { confirmRecipientDisplay, verifyRecipientAccount, openRecipientSession, receiveEntryShare, requestRecipientOtp,
  verifyRecipientOtp, verifyRecipientSecret, type RecipientSession } from './recipient-api'

const shareId = '00112233-4455-4677-8899-aabbccddeeff'
const session: RecipientSession = { sessionId: '11112233-4455-4677-8899-aabbccddeeff', sessionToken: 's'.repeat(43),
  expiresAt: '2099-01-01T00:00:00Z', recipientMode: 'namedRecipient', protection: 'pin',
  shareExpiresAt: '2099-01-02T00:00:00Z', maximumReceipts: 3, otpRetryAfterSeconds: 39 }
afterEach(() => { vi.unstubAllGlobals() })

describe('Anonymous sharing transport', () => {
  it('opens without account bearer, cookies, redirects, referrer or automatic retry', async () => {
    useAuthStore.setState({ accessToken: 'synthetic-account-access', sessionId: 'synthetic-refresh' })
    let request!: Request
    let body: unknown
    const fetcher = vi.fn<typeof fetch>(async (input) => { request = input as Request; body = await request.clone().json(); return Response.json(session) })
    vi.stubGlobal('fetch', fetcher)
    const result = await openRecipientSession(shareId, 'a'.repeat(43), new AbortController().signal)
    expect(result).toEqual(session)
    expect(request.url).toBe(`http://localhost:5000/api/entry-shares/${shareId}/sessions`)
    expect(request.method).toBe('POST')
    expect(request.headers.has('Authorization')).toBe(false)
    expect(request.credentials).toBe('omit')
    expect(request.cache).toBe('no-store')
    expect(request.redirect).toBe('error')
    expect(request.referrerPolicy).toBe('no-referrer')
    expect(body).toEqual({ accessToken: 'a'.repeat(43) })
  })

  it('sends only explicit session proofs and generation to the matching POST slices', async () => {
    const bodies: unknown[] = [], paths: string[] = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      const request = input as Request
      paths.push(new URL(request.url).pathname.split('/').at(-1)!)
      bodies.push(await request.json())
      if (paths.at(-1) === 'delivery') return Response.json({ ciphertext: 'synthetic' })
      return paths.at(-1) === 'otp' ? Response.json({ retryAfterSeconds: 39 }) : new Response(null, { status: 204 })
    }))
    const signal = new AbortController().signal
    const extra = { ...session, key: 'never-send-key', plaintext: 'never-send-plaintext' }
    expect(await requestRecipientOtp(shareId, extra, 2, 'pl', signal)).toEqual({ retryAfterSeconds: 39 })
    await verifyRecipientOtp(shareId, extra, 2, '654321', signal)
    await verifyRecipientSecret(shareId, extra, '123456', signal)
    await receiveEntryShare(shareId, extra, signal)
    await confirmRecipientDisplay(shareId, extra, signal)
    await verifyRecipientAccount(shareId, extra, 'synthetic-own-jwt', signal)
    expect(paths).toEqual(['otp', 'verify-otp', 'verify-secret', 'delivery', 'confirmation', 'verify-account'])
    expect(bodies).toEqual([
      { sessionToken: session.sessionToken, generation: 2, language: 'pl' },
      { sessionToken: session.sessionToken, generation: 2, code: '654321' },
      { sessionToken: session.sessionToken, secret: '123456' },
      ...Array.from({ length: 3 }, () => ({ sessionToken: session.sessionToken })),
    ])
  })

  it.each([401, 404, 429, 500])('discards sensitive HTTP error material and does not refresh on %s', async (status) => {
    const previous = useAuthStore.getState()
    const fetcher = vi.fn<typeof fetch>(async () => new Response('untrusted-sensitive-error', { status }))
    vi.stubGlobal('fetch', fetcher)
    let error: unknown
    try { await verifyRecipientSecret(shareId, session, 'synthetic-password', new AbortController().signal) }
    catch (caught) { error = caught }
    expect(error).toEqual(new Error('Sharing request unavailable'))
    expect(error).not.toHaveProperty('request')
    expect(error).not.toHaveProperty('response')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toBe(previous)
  })

  it.each(['session', 'delivery', 'otp'])('discards malformed JSON diagnostics from %s responses', async (operation) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('synthetic-sensitive-response', {
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetcher)
    const signal = new AbortController().signal
    const request = operation === 'session'
      ? openRecipientSession(shareId, 'a'.repeat(43), signal)
      : operation === 'otp' ? requestRecipientOtp(shareId, session, 1, 'en', signal) : receiveEntryShare(shareId, session, signal)
    await expect(request).rejects.toEqual(new Error('Sharing request unavailable'))
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
