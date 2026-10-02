import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'

const CHANNEL = 'palladin.entry-share.extension-save.v1'
export type ExtensionShareStatus = 'unavailable' | 'locked' | 'ready' | 'pending'
const statuses = new Set<ExtensionShareStatus>(['unavailable', 'locked', 'ready', 'pending'])

/** Status is presentation-only. The extension worker authenticates its sender independently. */
export function requestExtensionShareSave(type: 'status' | 'prepare', snapshot?: EntryShareSnapshot): Promise<ExtensionShareStatus> {
  return new Promise(resolve => {
    const requestId = crypto.randomUUID()
    const timer = window.setTimeout(() => finish('unavailable'), type === 'status' ? 1_500 : 10_000)
    function finish(status: ExtensionShareStatus) {
      window.clearTimeout(timer)
      window.removeEventListener('message', receive)
      resolve(status)
    }
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin
        || !event.data || typeof event.data !== 'object') return
      const response = event.data as Record<string, unknown>
      if (response.channel !== CHANNEL || response.type !== 'response'
        || response.requestId !== requestId || !statuses.has(response.status as ExtensionShareStatus)) return
      finish(response.status as ExtensionShareStatus)
    }
    window.addEventListener('message', receive)
    try {
      window.postMessage(type === 'prepare'
        ? { channel: CHANNEL, type, requestId, snapshot }
        : { channel: CHANNEL, type, requestId }, window.location.origin)
    } catch { finish('unavailable') }
  })
}
