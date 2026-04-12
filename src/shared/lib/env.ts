function requireEnv(key: string): string {
  const val = import.meta.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optionalEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? ''
}

export const env = {
  apiUrl: requireEnv('VITE_API_URL'),
  googleClientId: requireEnv('VITE_GOOGLE_CLIENT_ID'),
  signalrHubUrl: requireEnv('VITE_SIGNALR_HUB_URL'),
  posthogKey: optionalEnv('VITE_POSTHOG_KEY'),
  posthogHost: optionalEnv('VITE_POSTHOG_HOST'),
} as const
