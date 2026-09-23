import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HTTPError } from 'ky'
import { api } from './client'
import { useAuthStore } from '../../features/auth'
import { clearClientSession } from '../../features/auth/session/client-session'

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

  it('ignores a refresh response that belongs to the cleared session', async () => {
    let resolveRefresh!: (response: Response) => void
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url.includes('api/auth/refresh')) {
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve
        })
      }
      return new Response('unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = api.get('vaults').json()
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'))

    clearClientSession()
    useAuthStore.getState().setTokens({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      userId: 'user-b',
      isOnboarded: true,
    })
    resolveRefresh(new Response(JSON.stringify({
      accessToken: 'late-access-a',
      refreshToken: 'late-refresh-a',
      userId: 'user-a',
      isOnboarded: true,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(request).rejects.toBeInstanceOf(HTTPError)
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      userId: 'user-b',
    })
    expect(window.location.href).toBe('http://localhost:5000/')
  })

  it('does not resend an aborted mutation after token refresh completes', async () => {
    let resolveRefresh!: (response: Response) => void
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if ((input as Request).url.includes('api/auth/refresh')) {
        return new Promise<Response>((resolve) => { resolveRefresh = resolve })
      }
      return new Response('unauthorized', { status: 401 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = api.post('api/vaults/vault/entries/entry/delete', {
      json: { baseRevision: '7' }, signal: controller.signal,
    }).catch((error: unknown) => error)
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf('function'))
    controller.abort()
    resolveRefresh(new Response(JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh',
      userId: 'user-123', isOnboarded: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await request
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().refreshToken).toBe('new-refresh')
  })

  it('does not refresh or retry a request started by the previous session', async () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      userId: 'user-a',
      isOnboarded: true,
    })
    let resolveRequest!: (response: Response) => void
    const fetchMock = vi.fn(async () => new Promise<Response>((resolve) => {
      resolveRequest = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    const request = api.delete('vaults/vault-a').json()
    await vi.waitFor(() => expect(resolveRequest).toBeTypeOf('function'))

    clearClientSession()
    useAuthStore.getState().setTokens({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      userId: 'user-b',
      isOnboarded: true,
    })
    resolveRequest(new Response('unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
    }))

    await expect(request).rejects.toBeInstanceOf(HTTPError)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      userId: 'user-b',
    })
    expect(window.location.href).toBe('http://localhost:5000/')
  })

  it('does not send an automatic retry after the session changes', async () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      userId: 'user-a',
      isOnboarded: true,
    })
    const fetchMock = vi.fn(async () => {
      clearClientSession()
      useAuthStore.getState().setTokens({
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        userId: 'user-b',
        isOnboarded: true,
      })
      return new Response('temporary failure', {
        status: 500,
        statusText: 'Internal Server Error',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('vaults').json()).rejects.toMatchObject({
      response: expect.objectContaining({ status: 409 }),
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      userId: 'user-b',
    })
    expect(window.location.href).toBe('http://localhost:5000/')
  })

  it('does not redirect for an old 403 parsed after the session changes', async () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      userId: 'user-a',
      isOnboarded: true,
    })
    let releaseBody!: () => void
    let markBodyRead!: () => void
    const bodyRead = new Promise<void>((resolve) => {
      markBodyRead = resolve
    })
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        markBodyRead()
        return new Promise<void>((resolve) => {
          releaseBody = () => {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              error: 'errors.backend.email-not-verified',
            })))
            controller.close()
            resolve()
          }
        })
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 403,
      statusText: 'Forbidden',
      headers: { 'content-type': 'application/json' },
    })))

    const request = api.get('vaults').json()
    await bodyRead
    clearClientSession()
    useAuthStore.getState().setTokens({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      userId: 'user-b',
      isOnboarded: true,
    })
    releaseBody()

    await expect(request).rejects.toBeInstanceOf(HTTPError)
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      userId: 'user-b',
    })
    expect(window.location.href).toBe('http://localhost:5000/')
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
