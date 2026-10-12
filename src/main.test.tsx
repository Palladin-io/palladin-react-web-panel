import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Root } from 'react-dom/client'

const f = vi.hoisted(() => ({ bootstrap: vi.fn(), lifecycle: vi.fn(), roots: [] as Root[] }))
vi.mock('./features/auth/session/browser-session', () => ({ bootstrapBrowserSession: f.bootstrap, installBrowserSessionLifecycle: f.lifecycle }))
vi.mock('./shared/lib/i18n', () => ({}))
vi.mock('./shared/lib/entry-share-navigation', () => ({ installEntryShareNavigation: vi.fn() }))
vi.mock('./shared/lib/analytics.ts', () => ({ analytics: { reset: vi.fn() } }))
vi.mock('./shared/lib/clear-legacy-analytics.ts', () => ({ clearLegacyAnalytics: vi.fn() }))
vi.mock('./App.tsx', () => ({ default: () => <div>ready application</div> }))
vi.mock('./shared/components/startup-error', () => ({ StartupError: () => <div role="alert">startup unavailable</div> }))
vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return { ...actual, createRoot: (...args: Parameters<typeof actual.createRoot>) => {
    const root = actual.createRoot(...args); f.roots.push(root); return root
  } }
})
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); f.bootstrap.mockReset(); f.lifecycle.mockReset()
  vi.stubEnv('VITE_API_URL', 'https://api.example.test')
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'synthetic-client')
  vi.stubEnv('VITE_SIGNALR_HUB_URL', 'https://api.example.test/hubs/notifications')
  document.body.innerHTML = '<div id="root"></div>'
})
afterEach(async () => {
  const { clearPendingEntryShare } = await import('./shared/lib/entry-share-ingress')
  clearPendingEntryShare()
  window.history.replaceState(null, '', '/')
  act(() => { for (const root of f.roots.splice(0)) root.unmount() })
  vi.useRealTimers(); vi.unstubAllEnvs()
})
it('bounds presentation while session restoration is stalled without cancelling the cookie operation', async () => {
  let resolve!: () => void
  f.bootstrap.mockReturnValue(new Promise<void>(r => { resolve = r }))
  await act(async () => { await import('./main') })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(screen.getByRole('alert')).toHaveTextContent('startup unavailable')
  expect(screen.queryByText('ready application')).not.toBeInTheDocument()
  expect(f.lifecycle).not.toHaveBeenCalled()
  await act(async () => { resolve(); await vi.advanceTimersByTimeAsync(0) })
  expect(screen.getByText('ready application')).toBeInTheDocument()
  expect(f.bootstrap).toHaveBeenCalledOnce()
  expect(f.lifecycle).toHaveBeenCalledOnce()
})
it('clears the presentation timeout after successful startup', async () => {
  f.bootstrap.mockResolvedValue(undefined)
  await act(async () => { await import('./main'); await vi.advanceTimersByTimeAsync(0) })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  expect(screen.getByText('ready application')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

async function captureShare() {
  const ingress = await import('./shared/lib/entry-share-ingress')
  const { entryShareFragment } = await import('./shared/crypto/entry-share-link')
  const id = '00112233-4455-4677-8899-aabbccddeeff'
  window.history.replaceState(null, '', `/share/${id}${entryShareFragment({ key: new Uint8Array(32).fill(3), accessToken: new Uint8Array(32).fill(7) })}`)
  ingress.captureEntryShareIngress(window)
  return { read: () => ingress.readPendingEntryShare(id), held: ingress.readPendingEntryShare(id)! }
}
it('preserves a captured share during slow startup without extending its original memory deadline', async () => {
  const share = await captureShare()
  let resolve!: () => void
  f.bootstrap.mockReturnValue(new Promise<void>(r => { resolve = r }))
  await act(async () => { await import('./main') })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
  const retained = share.read()
  await act(async () => { resolve(); await vi.advanceTimersByTimeAsync(0) })
  expect(retained).toBe(share.held)
  expect(share.read()).toBe(share.held)
  expect(window.location.hash).toBe('')
  expect(screen.getByText('ready application')).toBeInTheDocument()
  await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000 - 10_000) })
  expect(share.read()).toBeNull()
  expect(share.held.key.every(value => value === 0)).toBe(true)
})
it('still wipes captured share material when startup actually fails', async () => {
  const share = await captureShare()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    f.bootstrap.mockRejectedValue(new Error('synthetic startup failure'))
    await act(async () => { await import('./main'); await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(share.read()).toBeNull()
    expect(share.held.key.every(value => value === 0)).toBe(true)
  } finally { log.mockRestore() }
})
