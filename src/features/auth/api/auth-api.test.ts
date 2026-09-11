import { HTTPError } from 'ky'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { captureClientSessionGeneration } from '../session/client-session'
import {
  AuthRateLimitError,
  revokeUninstalledLoginSession,
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


it.each([204, 401, 500])('revokes only the unused OAuth response without touching the live client on HTTP %s', async status => {
  useAuthStore.getState().setTokens({ accessToken: 'synthetic-current-access', refreshToken: 'synthetic-current-refresh',
    userId: '11111111-1111-4111-8111-111111111111', isOnboarded: true })
  useAuthStore.getState().unlockVault(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2))
  const current = useAuthStore.getState(), generation = captureClientSessionGeneration()
  let sentBody: unknown
  const fetchMock = vi.fn<typeof fetch>(async request => {
    sentBody = await (request as Request).clone().json()
    return new Response(null, { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  try {
    await revokeUninstalledLoginSession('synthetic-unused-refresh')
    expect(fetchMock).toHaveBeenCalledOnce()
    const request = fetchMock.mock.calls[0][0] as Request
    expect(new URL(request.url).pathname).toBe('/api/auth/logout')
    expect(sentBody).toEqual({ refreshToken: 'synthetic-unused-refresh' })
    expect(request.headers.has('Authorization')).toBe(false)
    expect(request.credentials).toBe('omit')
    expect(request.redirect).toBe('error')
    expect(captureClientSessionGeneration()).toBe(generation)
    expect(useAuthStore.getState().refreshToken).toBe(current.refreshToken)
    expect(useAuthStore.getState().masterKey).toBe(current.masterKey)
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
  } finally { vi.unstubAllGlobals(); useAuthStore.getState().logout() }
})
