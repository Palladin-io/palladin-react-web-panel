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

importScripts(
  'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js',
)
importScripts(
  'https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js',
)

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
  firebase.initializeApp(firebaseConfig)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {}
    const title = data.title || (payload.notification && payload.notification.title) || 'Palladin'
    const body = data.body || (payload.notification && payload.notification.body) || ''
    const link =
      (payload.fcmOptions && payload.fcmOptions.link) || data.link || '/'

    self.registration.showNotification(title, {
      body,
      icon: '/logo.png',
      // Carried into the click handler for deep-linking.
      data: { link },
    })
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'

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
