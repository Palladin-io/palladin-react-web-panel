export const REQUIRED_CLIENT_ENV_KEYS = [
  'VITE_API_URL',
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_SIGNALR_HUB_URL',
] as const

export type RequiredClientEnvKey = (typeof REQUIRED_CLIENT_ENV_KEYS)[number]

type ClientEnvironment = Readonly<
  Record<string, string | boolean | undefined>
>

export function findMissingRequiredClientEnv(
  values: ClientEnvironment,
): RequiredClientEnvKey[] {
  return REQUIRED_CLIENT_ENV_KEYS.filter((key) => {
    const value = values[key]
    return typeof value !== 'string' || value.trim().length === 0
  })
}

export function assertRequiredClientEnv(values: ClientEnvironment): void {
  const missingKeys = findMissingRequiredClientEnv(values)
  if (missingKeys.length === 0) return

  throw new Error(
    [
      'Palladin Web Panel cannot start because required environment variables are missing:',
      ...missingKeys.map((key) => `  - ${key}`),
      'Copy .env.example to .env.local, fill in the missing values, and restart npm run dev.',
    ].join('\n'),
  )
}
