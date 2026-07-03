import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HTTPError } from 'ky'
import { api } from './client'
import { useAuthStore } from '../../features/auth'

/**
 * Regression for CVT-195 (H3): the access token now lives in memory only and
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url
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
})
