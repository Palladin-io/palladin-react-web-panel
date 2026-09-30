import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entryShareFragment, parseEntryShareFragment } from '../crypto/entry-share-link'
import { captureEntryShareIngress, clearPendingEntryShare, readPendingEntryShare } from './entry-share-ingress'

const shareId = '00112233-4455-4677-8899-aabbccddeeff'
const secrets = { key: new Uint8Array(32).fill(3), accessToken: new Uint8Array(32).fill(7) }
const fragment = entryShareFragment(secrets)

beforeEach(() => { vi.useFakeTimers(); window.history.replaceState(null, '', '/') })
afterEach(() => { clearPendingEntryShare(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Entry sharing link ingress', () => {
  it('captures secrets only in RAM and removes fragment, query and old history state', () => {
    window.history.replaceState({ secret: fragment }, '', `/share/${shareId}?redirect=secret${fragment}`)
    const persistLocal = vi.spyOn(localStorage, 'setItem')
    const persistSession = vi.spyOn(Storage.prototype, 'setItem')
    captureEntryShareIngress(window)
    expect(window.location.pathname).toBe(`/share/${shareId}`)
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('')
    expect(window.history.state).toBeNull()
    expect(readPendingEntryShare(shareId)).toEqual({ shareId, ...secrets })
    expect(readPendingEntryShare('different')).toBeNull()
    expect(persistLocal).not.toHaveBeenCalled()
    expect(persistSession).not.toHaveBeenCalled()
  })

  it('wipes buffers on pagehide, including BFCache entry', () => {
    window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
    captureEntryShareIngress(window)
    const held = readPendingEntryShare(shareId)!
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    expect(readPendingEntryShare(shareId)).toBeNull()
    expect(held.key).toEqual(new Uint8Array(32))
    expect(held.accessToken).toEqual(new Uint8Array(32))
  })

  it('expires idle secret material even while the tab remains open', () => {
    window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
    captureEntryShareIngress(window)
    const held = readPendingEntryShare(shareId)!
    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(readPendingEntryShare(shareId)).toBeNull()
    expect(held.key).toEqual(new Uint8Array(32))
  })

  it('checks expiry synchronously when a suspended timer has not fired', () => {
    window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
    captureEntryShareIngress(window)
    vi.setSystemTime(Date.now() + 15 * 60 * 1000)
    expect(readPendingEntryShare(shareId)).toBeNull()
  })

  it('does not extend the in-memory lifetime when the wall clock moves backwards', () => {
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100)
    window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
    captureEntryShareIngress(window)
    vi.setSystemTime(Date.now() - 60 * 60 * 1000)
    monotonic.mockReturnValue(100 + 15 * 60 * 1000)
    expect(readPendingEntryShare(shareId)).toBeNull()
  })

  it('scrubs malformed links without keeping their secrets', () => {
    window.history.replaceState(null, '', `/share/not-an-id?key=bad${fragment}`)
    captureEntryShareIngress(window)
    expect(window.location.pathname).toBe('/share')
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('')
    expect(readPendingEntryShare(shareId)).toBeNull()
  })

  it('leaves unrelated auth fragments unchanged', () => {
    window.history.replaceState({ marker: true }, '', '/login?intent=example#other-fragment')
    captureEntryShareIngress(window)
    expect(window.location.hash).toBe('#other-fragment')
    expect(window.location.search).toBe('?intent=example')
    expect(window.history.state).toEqual({ marker: true })
  })

  it('throws if history scrubbing is unavailable so bootstrap can fail closed', () => {
    window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('Unavailable') })
    expect(() => captureEntryShareIngress(window)).toThrow('Unavailable')
    expect(readPendingEntryShare(shareId)).toBeNull()
  })

  it.each([
    `${fragment}&key=duplicate`, fragment.replace('v=1', 'v=2'),
    fragment.replace('key=', 'key=%41'), `${fragment}&utm_source=tracking`,
    fragment.replace('access=', 'access=='), '#',
  ])('rejects noncanonical, ambiguous or unsupported fragments', (value) => {
    expect(() => parseEntryShareFragment(value)).toThrow('Invalid Entry sharing link')
  })
})
