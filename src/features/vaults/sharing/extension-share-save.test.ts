// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestExtensionShareSave } from './extension-share-save'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('optional extension handoff presentation channel', () => {
  it('accepts a matching same-origin response', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation((value) => {
      const request = value as { requestId: string }
      queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {
        source: window, origin: window.location.origin,
        data: { channel: 'palladin.entry-share.extension-save.v1', type: 'response',
          requestId: request.requestId, status: 'ready' },
      })))
    })
    await expect(requestExtensionShareSave('status')).resolves.toBe('ready')
  })

  it('ignores an unrelated origin and fails closed on timeout', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'postMessage').mockImplementation((value) => {
      const request = value as { requestId: string }
      window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://other.example',
        data: { channel: 'palladin.entry-share.extension-save.v1', type: 'response',
          requestId: request.requestId, status: 'ready' } }))
    })
    const pending = requestExtensionShareSave('status')
    await vi.advanceTimersByTimeAsync(1_501)
    await expect(pending).resolves.toBe('unavailable')
  })

  it('does not accept a page-forged saved result as proof of an extension commit', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'postMessage').mockImplementation((value) => {
      const request = value as { requestId: string }
      window.dispatchEvent(new MessageEvent('message', { source: window, origin: window.location.origin,
        data: { channel: 'palladin.entry-share.extension-save.v1', type: 'response',
          requestId: request.requestId, status: 'saved' } }))
    })
    const pending = requestExtensionShareSave('prepare')
    await vi.advanceTimersByTimeAsync(10_001)
    await expect(pending).resolves.toBe('uncertain')
  })
})
