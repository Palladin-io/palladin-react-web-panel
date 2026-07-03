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

// ─── Subresource Integrity for the Firebase compat scripts ──────────────────
// `importScripts()` has no native `integrity`/`crossorigin` option, so we can't
// pin the bytes the way an <script integrity="…"> tag would on the page. To get
// the same guarantee we first `fetch(url, { integrity })` — the Fetch spec
// enforces SRI and rejects the response if the SHA-384 doesn't match — and only
// `importScripts` the URL once the integrity fetch has succeeded (the browser
// then loads the already-validated bytes from the HTTP cache).
//
// Version is pinned to 11.10.0. If you bump it, recompute the hashes with:
//   curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A
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
    // `integrity` makes the browser reject a tampered/mismatched response;
    // `crossorigin: anonymous` / mode 'cors' matches gstatic's CORS headers.
    const response = await fetch(url, {
      integrity,
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }
    // The integrity check above already passed, so loading from cache is safe.
    importScripts(url)
  }
}

/**
 * Only accept same-origin, absolute-path links for deep-linking. Anything else
 * (absolute URLs, protocol-relative `//evil.com`, `javascript:` …) is rejected
 * and falls back to the app root, so a malicious push payload can never
 * navigate the user off-origin.
 */
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
        const data = payload.data || {}
        const title =
          data.title || (payload.notification && payload.notification.title) || 'Palladin'
        const body = data.body || (payload.notification && payload.notification.body) || ''
        const link = safeInternalPath(
          (payload.fcmOptions && payload.fcmOptions.link) || data.link || '/',
        )

        self.registration.showNotification(title, {
          body,
          icon: '/logo.png',
          // Carried into the click handler for deep-linking (already validated).
          data: { link },
        })
      })
    })
    .catch((err) => {
      // Integrity failure or network error — push simply stays disabled, the
      // panel still works fully via SignalR.
      console.error('[fcm-sw] Firebase init skipped:', err)
    })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Re-validate at click time (defense in depth) in case the stored value was
  // ever set without going through `safeInternalPath`.
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
