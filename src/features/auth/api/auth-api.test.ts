import { HTTPError } from 'ky'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthRateLimitError,
  fetchLoginKdf,
  passwordLogin,
  totpLogin,
} from './auth-api'

describe('auth API rate limiting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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
})
