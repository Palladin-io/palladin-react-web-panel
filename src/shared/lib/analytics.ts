import posthog from 'posthog-js'
import { env } from './env.ts'

let initialized = false

export const analytics = {
  init() {
    if (initialized || !env.posthogKey) {
      return
    }

    posthog.init(env.posthogKey, {
      api_host: env.posthogHost,
    })

    initialized = true
  },

  capture(module: string, event: string, properties?: Record<string, unknown>) {
    posthog.capture(`fe:${module}:${event}`, properties)
  },

  getSessionId(): string | undefined {
    return posthog.get_session_id?.()
  },

  identify(userId: string, properties?: Record<string, unknown>) {
    posthog.identify(userId, properties)
  },

  reset() {
    posthog.reset()
  },
}
