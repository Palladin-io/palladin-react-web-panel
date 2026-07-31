/* global importScripts, firebase, self, clients */
/*
 * Firebase Cloud Messaging service worker — handles Web Push when the tab is
 * closed or backgrounded.
 *
 * This file lives in `public/` and is served as-is (it is NOT processed by
 * Vite), so it cannot read `import.meta.env`. The page registers it with the
 * (public, non-secret) Firebase messaging config in the query string; we read
 * that config from `location.search` here. No secrets are hardcoded.
 *
 * The VAPID key is never needed in the SW — it is only used by `getToken` on
 * the page side.
 */

// `importScripts()` has no native `integrity`, so we `fetch(url, { integrity })`
// first (Fetch enforces SRI) and only `importScripts` the validated-and-cached bytes.
const FIREBASE_SCRIPTS = [
  {
    url: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js',
    integrity: 'sha384-b1CWci0SaI05xAJao7+U+7e+gNKOl4vZnNQHy/DYL4qnfACkhq8nV/8rasGUskSc',
  },
  {
    url: 'https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js',
    integrity: 'sha384-EF4KAy5E+/dGt1gzZ/wxKecnD6B8E9GrdcYPbyikXv6p1EW6kh69mnCZ9JWu4/Ix',
  },
]

async function importFirebaseWithIntegrity() {
  for (const { url, integrity } of FIREBASE_SCRIPTS) {
    const response = await fetch(url, {
      integrity,
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }
    importScripts(url)
  }
}

// Accept only same-origin absolute paths so a malicious push payload can't navigate off-origin.
function safeInternalPath(link) {
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//')) {
    return '/'
  }
  try {
    const url = new URL(link, self.location.origin)
    if (url.origin !== self.location.origin) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}

const params = new URLSearchParams(self.location.search)
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
}

// Only initialise when the page supplied a config — avoids throwing in dev
// environments where Firebase isn't set up.
if (firebaseConfig.apiKey && firebaseConfig.appId) {
  importFirebaseWithIntegrity()
    .then(() => {
      firebase.initializeApp(firebaseConfig)
      const messaging = firebase.messaging()

      messaging.onBackgroundMessage((payload) => {
        // The canonical push contract is intentionally generic. Never render
        // server-provided title/body/link fields: lock-screen copy must not
        // disclose account, Vault or Entry presentation data.
        self.registration.showNotification('Palladin', {
          body: 'Open Palladin to view this notification.',
          icon: '/logo.png',
          data: { link: '/inbox' },
        })
      })
    })
    .catch((err) => {
      console.error('[fcm-sw] Firebase init skipped:', err)
    })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = safeInternalPath(
    (event.notification.data && event.notification.data.link) || '/',
  )

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an existing tab if one is already open, else open a new one.
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus()
            if ('navigate' in client) client.navigate(link)
            return undefined
          }
        }
        if (clients.openWindow) return clients.openWindow(link)
        return undefined
      }),
  )
})
