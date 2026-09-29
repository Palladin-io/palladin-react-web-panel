import type { RequiredClientEnvKey } from './required-client-env'
import { selectSharedUnlockExtension } from './shared-unlock-extension-id'

function requireEnv(key: RequiredClientEnvKey): string {
  const val = import.meta.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optionalEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? ''
}

const sharedUnlock = selectSharedUnlockExtension(globalThis.navigator?.userAgent ?? '',
  optionalEnv('VITE_SHARED_UNLOCK_EXTENSION_ID'), optionalEnv('VITE_SHARED_UNLOCK_FIREFOX_EXTENSION_ID'),
  optionalEnv('VITE_SHARED_UNLOCK_SAFARI_EXTENSION_ID'))

export const env = {
  appleAppStoreUrl: optionalEnv('VITE_APPLE_APP_STORE_URL'),
  googlePlayStoreUrl: optionalEnv('VITE_GOOGLE_PLAY_STORE_URL'),
  sharedUnlockExtensionId: sharedUnlock.extensionId,
  sharedUnlockTransport: sharedUnlock.transport,
  apiUrl: requireEnv('VITE_API_URL'),
  publicAssetUrl: optionalEnv('VITE_PUBLIC_ASSET_URL') || (requireEnv('VITE_API_URL').startsWith('http://localhost:')
    ? 'http://localhost:4566/palladin-local-public-assets'
    : 'https://assets.palladin.io'),
  googleClientId: requireEnv('VITE_GOOGLE_CLIENT_ID'),
  signalrHubUrl: requireEnv('VITE_SIGNALR_HUB_URL'),
  posthogKey: optionalEnv('VITE_POSTHOG_KEY'),
  posthogHost: optionalEnv('VITE_POSTHOG_HOST'),
  clientAnalyticsReleased: optionalEnv('VITE_CLIENT_ANALYTICS_RELEASED') === 'true',

  // Firebase Cloud Messaging (Web Push). All optional — when any of these are
  // empty, web push is simply disabled (see `isFirebaseConfigured`). The web
  // panel still works fully via SignalR; push is complementary.
  firebaseApiKey: optionalEnv('VITE_FIREBASE_API_KEY'),
  firebaseAuthDomain: optionalEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  firebaseProjectId: optionalEnv('VITE_FIREBASE_PROJECT_ID'),
  firebaseMessagingSenderId: optionalEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  firebaseAppId: optionalEnv('VITE_FIREBASE_APP_ID'),
  firebaseVapidKey: optionalEnv('VITE_FIREBASE_VAPID_KEY'),
} as const

/** True only when every Firebase value required for web push is present. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    env.firebaseApiKey &&
      env.firebaseAuthDomain &&
      env.firebaseProjectId &&
      env.firebaseMessagingSenderId &&
      env.firebaseAppId &&
      env.firebaseVapidKey,
  )
}
