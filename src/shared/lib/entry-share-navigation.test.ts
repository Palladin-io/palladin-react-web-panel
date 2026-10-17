import { createBrowserHistory } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { entryShareFragment } from '../crypto/entry-share-link'
import { clearPendingEntryShare, readPendingEntryShare } from './entry-share-ingress'
import { installEntryShareNavigation } from './entry-share-navigation'

const shareId = '00112233-4455-4677-8899-aabbccddeeff'
const path = `/share/${shareId}`
const fragment = entryShareFragment({ key: new Uint8Array(32).fill(3), accessToken: new Uint8Array(32).fill(7) })
let stop: () => void
beforeEach(() => { window.history.replaceState(null, '', '/'); stop = () => {} })
afterEach(() => { stop(); clearPendingEntryShare(); vi.restoreAllMocks() })

it('captures a native in-document link before browser-history subscribers see it', () => {
  const nativeReplace = window.history.replaceState.bind(window.history)
  stop = installEntryShareNavigation(window, vi.fn())
  const history = createBrowserHistory()
  const observed: string[] = []
  const unsubscribe = history.subscribe(({ location }) => observed.push(location.href))
  try {
    nativeReplace({ leaked: fragment }, '', `${path}?tracking=forbidden${fragment}`)
    window.dispatchEvent(new PopStateEvent('popstate', { state: { leaked: fragment } }))
    expect(readPendingEntryShare(shareId)).not.toBeNull()
    expect(window.location.href).toBe(`${window.location.origin}${path}`)
    expect(window.history.state).toBeNull()
    expect(observed).toEqual([path])
  } finally { unsubscribe(); history.destroy() }
})

it('swallows raw hash event URLs and does not recapture the later event of a scrubbed popstate', () => {
  stop = installEntryShareNavigation(window, vi.fn())
  const laterListener = vi.fn()
  window.addEventListener('hashchange', laterListener)
  try {
    window.history.replaceState(null, '', `${path}${fragment}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    const first = readPendingEntryShare(shareId)
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: `${location.origin}${path}`, newURL: `${location.origin}${path}${fragment}` }))
    expect(first).not.toBeNull()
    expect(readPendingEntryShare(shareId)).toBe(first)
    expect(laterListener).not.toHaveBeenCalled()
  } finally { window.removeEventListener('hashchange', laterListener) }
})

it('replaces and wipes a same-ID link and scrubs an invalid replacement', () => {
  window.history.replaceState(null, '', `${path}${fragment}`)
  stop = installEntryShareNavigation(window, vi.fn())
  const first = readPendingEntryShare(shareId)!
  window.history.replaceState(null, '', `${path}${fragment}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  expect(readPendingEntryShare(shareId)).not.toBe(first)
  expect(first.key).toEqual(new Uint8Array(32))
  window.history.replaceState(null, '', `${path}#invalid`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  expect(readPendingEntryShare(shareId)).toBeNull()
  expect(location.hash).toBe('')
})

it('leaves unrelated auth fragments and their events untouched', () => {
  stop = installEntryShareNavigation(window, vi.fn())
  window.history.replaceState({ marker: true }, '', '/login#provider-state')
  const listener = vi.fn()
  window.addEventListener('hashchange', listener)
  try {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(location.hash).toBe('#provider-state')
    expect(listener).toHaveBeenCalledOnce()
    expect(window.history.state).toEqual({ marker: true })
  } finally { window.removeEventListener('hashchange', listener) }
})

it('fails closed if a later URL cannot be scrubbed, without forwarding the event', () => {
  const failed = vi.fn()
  stop = installEntryShareNavigation(window, failed)
  window.history.replaceState(null, '', `${path}${fragment}`)
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('secret diagnostics') })
  const listener = vi.fn()
  window.addEventListener('popstate', listener)
  try {
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(failed).toHaveBeenCalledWith()
    expect(readPendingEntryShare(shareId)).toBeNull()
    expect(listener).not.toHaveBeenCalled()
  } finally { window.removeEventListener('popstate', listener) }
})
