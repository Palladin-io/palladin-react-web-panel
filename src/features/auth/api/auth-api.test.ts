import { HTTPError } from 'ky'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { captureClientSessionGeneration } from '../session/client-session'
import {
  AuthRateLimitError,
  fetchLoginKdf,
  passwordLogin,
  totpLogin,
} from './auth-api'

describe('auth API rate limiting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it.each([
    ['KDF bootstrap', () => fetchLoginKdf('member@example.com', 'identity-argon2id-password-v1')],
    ['password login', () => passwordLogin({
      email: 'member@example.com',
      securityVersion: 1,
      kdfProfileId: 'identity-argon2id-password-v1',
      authCredential: 'credential',
    })],
    ['TOTP login', () => totpLogin({ challengeToken: 'challenge', code: '123456' })],
  ])('maps 429 with Retry-After for %s', async (_name, operation) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 429,
      headers: { 'Retry-After': '45' },
    })))

    await expect(operation()).rejects.toMatchObject({
      name: 'AuthRateLimitError',
      retryAfterSeconds: 45,
    })
  })

  it('preserves non-rate-limit HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))

    await expect(totpLogin({ challengeToken: 'challenge', code: '000000' }))
      .rejects.toBeInstanceOf(HTTPError)
    await expect(Promise.reject(new AuthRateLimitError(null)))
      .rejects.toMatchObject({ retryAfterSeconds: null })
  })

  it.each([false, true])('keeps a rejected TOTP challenge retryable with existing session=%s', async (existingSession) => {
    useAuthStore.setState({
      accessToken: existingSession ? 'synthetic-access' : null,
      refreshToken: existingSession ? 'synthetic-refresh' : null,
    })
    const generation = captureClientSessionGeneration()
    const location = window.location.href
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(totpLogin({ challengeToken: 'challenge', code: '000000' }))
      .rejects.toBeInstanceOf(HTTPError)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(captureClientSessionGeneration()).toBe(generation)
    expect(window.location.href).toBe(location)
    expect(useAuthStore.getState().refreshToken).toBe(existingSession ? 'synthetic-refresh' : null)
    const request = fetchMock.mock.calls[0][0] as Request
    expect(request.headers.has('Authorization')).toBe(false)
    expect(request.credentials).toBe('omit')
    expect(request.redirect).toBe('error')
  })
})
