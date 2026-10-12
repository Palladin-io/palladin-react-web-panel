import { beforeEach, expect, it, vi } from 'vitest'
import { browserSessionPost } from './browser-session-transport'

let sentBody: unknown
beforeEach(() => {
  sentBody = undefined
  vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, action) => action()) } })
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    sentBody = await request.clone().json()
    return new Response(JSON.stringify({ sessionId: 'own-session' }))
  }))
})

it('sends browser credentials and the CSRF header without a JSON refresh token', async () => {
  await browserSessionPost('auth/refresh')
  const request = vi.mocked(fetch).mock.calls[0]![0] as Request
  expect(request.url).toContain('/api/browser/auth/refresh')
  expect(request.credentials).toBe('include')
  expect(request.headers.get('X-Palladin-Browser')).toBe('1')
  expect(request.redirect).toBe('error')
  expect(request.cache).toBe('no-store')
  expect(sentBody).toEqual({})
  expect(navigator.locks.request).toHaveBeenCalledOnce()
})

it('does not retry a rejected cookie mutation', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503 }))
  await expect(browserSessionPost('auth/refresh')).rejects.toThrow()
  expect(fetch).toHaveBeenCalledOnce()
})

it('fails closed without cross-document cookie serialization', async () => {
  vi.stubGlobal('navigator', {})
  await expect(browserSessionPost('auth/login', { json: {} })).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
