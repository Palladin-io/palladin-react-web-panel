import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HTTPError } from 'ky'
import { api, authenticatedRequestContext } from './client'
import { useAuthStore } from '../../features/auth'
import {
  captureAuthenticatedSession,
  replaceAuthenticatedSession,
  StaleAuthenticatedSessionError,
} from '../../features/auth/session/session-boundary'
import type { AuthResponse } from './types'

/**
 * Regression: the access token now lives in memory only and
 * is dropped from the persisted store, so the `afterResponse` 401 handler can
 * no longer gate logout on `accessToken !== null` — it must ALWAYS log out and
 * redirect when a refresh attempt fails. This test drives the failed-refresh
 * path and asserts the store is reset (logout) and navigation to /login fires.
 */

const originalLocation = window.location

function stubLocation() {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: 'http://localhost:5000/' },
  })
}

function restoreLocation() {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  })
}

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({ sub: userId, org_id: organizationId })}.signature`
}

function session(userId: string, organizationId: string): AuthResponse {
  return {
    accessToken: jwt(userId, organizationId),
    refreshToken: `refresh-${userId}-${organizationId}`,
    userId,
    isOnboarded: true,
    emailVerified: true,
  }
}

describe('api client — 401 with failing refresh', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    stubLocation()
    // Post-reload state: accessToken is in-memory only, so it is null after a
    // reload, while the persisted refreshToken survives. This is exactly the
    // state where the old `accessToken !== null` guard stranded the user.
    useAuthStore.setState({
      accessToken: null,
      refreshToken: 'refresh-token-abc',
      userId: 'user-123',
      isOnboarded: true,
      permissions: 42,
    })
  })

  afterEach(() => {
    restoreLocation()
    useAuthStore.getState().logout()
  })

  it('forces logout and redirects to /login when the refresh POST fails', async () => {
    const fetchMock = vi.fn(async () => {
      // Both the original request and the refresh POST reject with 401.
      // The failing refresh is what must trigger the unconditional logout.
      return new Response('unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    // The original request ultimately rejects (ky throws HTTPError on 401),
    // but the security-relevant side effects happen in the afterResponse hook.
    await expect(api.get('vaults').json()).rejects.toBeInstanceOf(HTTPError)

    // Refresh was actually attempted (proves the refresh path was taken).
    const refreshCalled = fetchMock.mock.calls.some(([input]) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      return url.includes('api/auth/refresh')
    })
    expect(refreshCalled).toBe(true)

    // logout() ran → store reset to initial (both tokens cleared).
    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(state.userId).toBeNull()
    expect(state.isOnboarded).toBe(false)
    expect(state.permissions).toBe(0)

    // Navigation to the login screen happened.
    expect(window.location.href).toBe('/login')
  })

  it('preserves the requested deep link when refresh fails on /unlock', async () => {
    window.location.href =
      'http://localhost:5000/unlock?redirect=%2Fvaults%2Fvault-1%2Fentries%2Fentry-1%3Ftab%3Dlogs%23history'
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('unauthorized', {
            status: 401,
            statusText: 'Unauthorized',
          }),
      ),
    )

    await expect(api.get('vaults').json()).rejects.toBeInstanceOf(HTTPError)

    expect(window.location.href).toBe(
      '/login?redirect=%2Fvaults%2Fvault-1%2Fentries%2Fentry-1%3Ftab%3Dlogs%23history',
    )
  })
})

describe('api client — 403 email-verification backstop', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    stubLocation()
    useAuthStore.setState({
      accessToken: 'access-token-abc',
      refreshToken: 'refresh-token-abc',
      userId: 'user-123',
      isOnboarded: true,
      emailVerified: false,
      permissions: 42,
    })
  })

  afterEach(() => {
    restoreLocation()
    useAuthStore.getState().logout()
  })

  it('redirects to /verify-email on a 403 carrying the email-not-verified key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'errors.backend.email-not-verified' }), {
            status: 403,
            statusText: 'Forbidden',
          }),
      ),
    )

    await expect(api.get('vaults').json()).rejects.toBeInstanceOf(HTTPError)
    expect(window.location.href).toBe('/verify-email')
  })

  it('leaves an ordinary permission-denied 403 untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'errors.backend.forbidden' }), {
            status: 403,
            statusText: 'Forbidden',
          }),
      ),
    )

    await expect(api.get('vaults').json()).rejects.toBeInstanceOf(HTTPError)
    // No email-verification key → no redirect; the caller handles the 403.
    expect(window.location.href).toBe('http://localhost:5000/')
  })
})

describe('api client — refresh session snapshot', () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    stubLocation()
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
  })

  afterEach(() => {
    restoreLocation()
    useAuthStore.getState().logout()
  })

  it('rejects an explicitly A-bound request before fetch after switching to B', async () => {
    const sessionA = captureAuthenticatedSession()
    const accountB = session('user-b', 'org-b')
    await replaceAuthenticatedSession(accountB)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.post('vaults/a-derived-payload', {
      json: { encryptedMaterial: 'derived-under-a' },
      ...authenticatedRequestContext(sessionA),
    })).rejects.toBeInstanceOf(StaleAuthenticatedSessionError)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().accessToken).toBe(accountB.accessToken)
  })

  it('ignores a late refresh response from A after switching to B', async () => {
    let resolveRefresh!: (response: Response) => void
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve
    })
    let refreshStarted = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api/auth/refresh')) {
        refreshStarted = true
        return refreshResponse
      }
      return new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    }))

    const request = api.get('vaults').json()
    await vi.waitFor(() => expect(refreshStarted).toBe(true))
    const accountB = session('user-b', 'org-b')
    await replaceAuthenticatedSession(accountB)
    resolveRefresh(new Response(JSON.stringify(session('user-a', 'org-a')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(request).rejects.toBeInstanceOf(HTTPError)
    expect(useAuthStore.getState().userId).toBe('user-b')
    expect(useAuthStore.getState().organizationId).toBe('org-b')
    expect(useAuthStore.getState().accessToken).toBe(accountB.accessToken)
  })

  it('does not refresh, retry, or redirect when A returns 401 after switching to B', async () => {
    let resolveOriginal!: (response: Response) => void
    const originalResponse = new Promise<Response>((resolve) => {
      resolveOriginal = resolve
    })
    let originalStarted = false
    let refreshCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api/auth/refresh')) {
        refreshCalls += 1
        return new Response('unexpected refresh', { status: 500 })
      }
      originalStarted = true
      return originalResponse
    })
    vi.stubGlobal('fetch', fetchMock)

    const observed = api.get('vaults/late-401').json().catch((error) => error)
    await vi.waitFor(() => expect(originalStarted).toBe(true))
    const accountB = session('user-b', 'org-b')
    await replaceAuthenticatedSession(accountB)
    resolveOriginal(new Response('unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
    }))

    expect(await observed).toBeInstanceOf(HTTPError)
    expect(refreshCalls).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe(accountB.accessToken)
    expect(window.location.href).toBe('http://localhost:5000/')
  })

  it('does not redirect when A returns email-verification 403 after switching to B', async () => {
    let resolveOriginal!: (response: Response) => void
    const originalResponse = new Promise<Response>((resolve) => {
      resolveOriginal = resolve
    })
    let originalStarted = false
    const fetchMock = vi.fn(async () => {
      originalStarted = true
      return originalResponse
    })
    vi.stubGlobal('fetch', fetchMock)

    const observed = api.get('vaults/late-403').json().catch((error) => error)
    await vi.waitFor(() => expect(originalStarted).toBe(true))
    const accountB = session('user-b', 'org-b')
    await replaceAuthenticatedSession(accountB)
    resolveOriginal(new Response(JSON.stringify({
      error: 'errors.backend.email-not-verified',
    }), {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(await observed).toBeInstanceOf(HTTPError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe(accountB.accessToken)
    expect(window.location.href).toBe('http://localhost:5000/')
  })

  it('ignores a late refresh error from A after switching to B', async () => {
    let rejectRefresh!: (reason: Error) => void
    const refreshResponse = new Promise<Response>((_resolve, reject) => {
      rejectRefresh = reject
    })
    let refreshStarted = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      if (url.includes('api/auth/refresh')) {
        refreshStarted = true
        return refreshResponse
      }
      return new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    }))

    const request = api.get('vaults').json()
    await vi.waitFor(() => expect(refreshStarted).toBe(true))
    const accountB = session('user-b', 'org-b')
    await replaceAuthenticatedSession(accountB)
    rejectRefresh(new Error('late refresh failure'))

    await expect(request).rejects.toBeInstanceOf(HTTPError)
    expect(useAuthStore.getState().userId).toBe('user-b')
    expect(useAuthStore.getState().organizationId).toBe('org-b')
    expect(useAuthStore.getState().accessToken).toBe(accountB.accessToken)
    expect(window.location.href).toBe('http://localhost:5000/')
  })

  it('retries every deduplicated request when refresh-token rotation occurs', async () => {
    const rotated = {
      ...session('user-a', 'org-a'),
      accessToken: jwt('user-a', 'org-a') + '.rotated',
      refreshToken: 'refresh-user-a-org-a-rotated',
    }
    let refreshCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      if (request.url.includes('api/auth/refresh')) {
        refreshCalls += 1
        return new Response(JSON.stringify(rotated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (request.headers.get('Authorization') === `Bearer ${rotated.accessToken}`) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    }))

    const [first, second] = await Promise.all([
      api.get('vaults/one').json<{ ok: boolean }>(),
      api.get('vaults/two').json<{ ok: boolean }>(),
    ])

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(refreshCalls).toBe(1)
    expect(useAuthStore.getState().refreshToken).toBe(rotated.refreshToken)
  })

  it('rejects a refresh whose JWT subject differs from its response userId', async () => {
    let requestCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request
      if (request.url.includes('api/auth/refresh')) {
        return new Response(JSON.stringify({
          ...session('user-a', 'org-a'),
          accessToken: jwt('different-user', 'org-a'),
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      requestCalls += 1
      return new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    }))

    await expect(api.get('vaults/mismatched-refresh').json())
      .rejects.toBeInstanceOf(HTTPError)

    expect(requestCalls).toBe(1)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().userId).toBeNull()
    expect(window.location.href).toBe('/login')
  })
})
