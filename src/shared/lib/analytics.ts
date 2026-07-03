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
      // ─── Zero-knowledge hardening ──────────────────────────────────────────
      // This is a password manager: PostHog must NEVER be able to capture the
      // contents of an input or a revealed secret.
      //   • autocapture off — no automatic capture of clicks/inputs/text, which
      //     could otherwise scrape field values or DOM text.
      //   • session recording off — we never record the screen. The mask config
      //     below is belt-and-suspenders in case recording is ever toggled on
      //     from the PostHog UI: every input value and all text is masked.
      // Secret inputs / revealed values additionally carry `.ph-no-capture`.
      autocapture: false,
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
      },
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
