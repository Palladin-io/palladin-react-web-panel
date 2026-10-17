import { randomUuid } from '../../../shared/crypto/random-uuid'
import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'

const CHANNEL = 'palladin.entry-share.extension-save.v1'
export type ExtensionShareStatus = 'unavailable' | 'locked' | 'ready' | 'pending'
export type ExtensionShareResult = ExtensionShareStatus | 'uncertain'
const statuses: Record<'status' | 'prepare', ReadonlySet<ExtensionShareResult>> = {
  status: new Set(['unavailable', 'locked', 'ready']),
  prepare: new Set(['unavailable', 'locked', 'pending']),
}

/** Status is presentation-only. The extension worker authenticates its sender independently. */
export function requestExtensionShareSave(type: 'status' | 'prepare', snapshot?: EntryShareSnapshot): Promise<ExtensionShareResult> {
  return new Promise(resolve => {
    const requestId = randomUuid()
    const timer = window.setTimeout(() => finish(type === 'status' ? 'unavailable' : 'uncertain'), 10_000)
    function finish(status: ExtensionShareResult) {
      window.clearTimeout(timer)
      window.removeEventListener('message', receive)
      resolve(status)
    }
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin
        || !event.data || typeof event.data !== 'object') return
      const response = event.data as Record<string, unknown>
      if (response.channel !== CHANNEL || response.type !== 'response'
        || response.requestId !== requestId || !statuses[type].has(response.status as ExtensionShareResult)) return
      finish(response.status as ExtensionShareResult)
    }
    window.addEventListener('message', receive)
    try {
      window.postMessage(type === 'prepare'
        ? { channel: CHANNEL, type, requestId, snapshot }
        : { channel: CHANNEL, type, requestId }, window.location.origin)
    } catch { finish('unavailable') }
  })
}
