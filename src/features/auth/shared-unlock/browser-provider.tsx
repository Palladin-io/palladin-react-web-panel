import { setSharedUnlockBrowserStatus } from './browser-status'
import { coordinateSharedUnlockBrowser } from './browser-runtime'
import { useEffect } from 'react'
import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import type { SharedUnlockNativeRuntime } from './browser-channel'
import { startSharedUnlockBrowserLifecycle } from './browser-lifecycle'
import { createFirefoxSharedUnlockRuntime } from './firefox-runtime'

/** Mounted once at app root, including login/unlock routes. No permission prompt. */
export function SharedUnlockBrowserProvider() {
  useEffect(() => {
    if (!env.sharedUnlockExtensionId) { setSharedUnlockBrowserStatus('not-configured'); return }
    if (typeof window.crypto?.getRandomValues !== 'function' || (!navigator.locks && !window.indexedDB)) {
      setSharedUnlockBrowserStatus('unsupported'); return
    }
    const browser = window as Window & { chrome?: { runtime?: SharedUnlockNativeRuntime }; browser?: { runtime?: SharedUnlockNativeRuntime } }
    const firefox = env.sharedUnlockTransport === 'firefox'
      ? createFirefoxSharedUnlockRuntime(window, document, env.sharedUnlockExtensionId) : undefined
    const lifecycle = startSharedUnlockBrowserLifecycle({
      onReady: coordinateSharedUnlockBrowser,
      onStatus: setSharedUnlockBrowserStatus,
      extensionId: env.sharedUnlockExtensionId, apiUrl: env.apiUrl, window, document,
      runtime: () => {
        if (env.sharedUnlockTransport === 'firefox') return firefox
        // Safari exposes externally_connectable only on its browser namespace.
        // Missing Safari API must not select another browser's configured route.
        const native = env.sharedUnlockTransport === 'safari' ? browser.browser?.runtime : browser.chrome?.runtime
        return typeof native?.connect === 'function' ? native : undefined
      },
      // pagehide can enter BFCache without destroying JS memory. Retire only this
      // document's keys/access token; peer loss never calls this action.
      retireDocument: () => useAuthStore.getState().expireSession('pagehide'),
    })
    return () => lifecycle.close()
  }, [])
  return null
}
