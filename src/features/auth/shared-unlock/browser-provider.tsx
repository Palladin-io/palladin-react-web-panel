import { coordinateSharedUnlockBrowser } from './browser-runtime'
import { useEffect } from 'react'
import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import type { SharedUnlockNativeRuntime } from './browser-channel'
import { startSharedUnlockBrowserLifecycle } from './browser-lifecycle'

/** Mounted once at app root, including login/unlock routes. No permission prompt. */
export function SharedUnlockBrowserProvider() {
  useEffect(() => {
    if (!env.sharedUnlockExtensionId) return
    const browser = window as Window & { chrome?: { runtime?: SharedUnlockNativeRuntime } }
    const lifecycle = startSharedUnlockBrowserLifecycle({
      onReady: coordinateSharedUnlockBrowser,
      extensionId: env.sharedUnlockExtensionId, apiUrl: env.apiUrl, window, document,
      runtime: () => typeof browser.chrome?.runtime?.connect === 'function' ? browser.chrome.runtime : undefined,
      // pagehide can enter BFCache without destroying JS memory. Retire only this
      // document's keys/access token; peer loss never calls this action.
      retireDocument: () => useAuthStore.getState().expireSession('pagehide'),
    })
    return () => lifecycle.close()
  }, [])
  return null
}
