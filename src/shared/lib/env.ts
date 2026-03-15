export const env = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
  posthogKey: import.meta.env.VITE_POSTHOG_KEY as string,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST as string,
  signalrHubUrl: import.meta.env.VITE_SIGNALR_HUB_URL as string,
} as const
