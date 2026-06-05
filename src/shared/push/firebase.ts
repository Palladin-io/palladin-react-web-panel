import type { FirebaseApp } from 'firebase/app'
import type { Messaging } from 'firebase/messaging'
import { env, isFirebaseConfigured } from '../lib/env'

/**
 * Lazy Firebase Cloud Messaging bootstrap for Web Push.
 *
 * Firebase is only initialised on demand (first call), and only when:
 *   1. The browser supports the Messaging APIs (`isSupported`), and
 *   2. Every required `VITE_FIREBASE_*` env var is present.
 *
 * No secrets live in code — config comes entirely from env. When config is
 * missing (e.g. local dev without Firebase), this returns `null` and the rest
 * of the push flow no-ops, leaving SignalR as the sole real-time channel.
 */

let appPromise: Promise<FirebaseApp | null> | null = null
let messagingPromise: Promise<Messaging | null> | null = null

const firebaseConfig = {
  apiKey: env.firebaseApiKey,
  authDomain: env.firebaseAuthDomain,
  projectId: env.firebaseProjectId,
  messagingSenderId: env.firebaseMessagingSenderId,
  appId: env.firebaseAppId,
}

async function getApp(): Promise<FirebaseApp | null> {
  if (!isFirebaseConfigured()) return null
  // Dynamic import keeps the ~200KB Firebase SDK out of the main bundle — it is
  // only fetched the first time push is actually used.
  const { isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) return null
  if (!appPromise) {
    appPromise = import('firebase/app').then(({ initializeApp }) =>
      initializeApp(firebaseConfig),
    )
  }
  return appPromise
}

/** Returns a `Messaging` instance, or `null` when push is unavailable. */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const app = await getApp()
      if (!app) return null
      const { getMessaging } = await import('firebase/messaging')
      return getMessaging(app)
    })()
  }
  return messagingPromise
}
