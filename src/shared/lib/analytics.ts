import posthog, { type CaptureResult } from 'posthog-js'
import { env } from './env.ts'

let initialized = false

const LOCATION_PROPERTIES = [
  '$current_url',
  '$host',
  '$pathname',
  '$referrer',
  '$referring_domain',
  '$initial_current_url',
  '$initial_host',
  '$initial_pathname',
  '$initial_referrer',
  '$initial_referring_domain',
  '$session_entry_url',
  '$session_entry_host',
  '$session_entry_pathname',
  '$session_entry_referrer',
  '$session_entry_referring_domain',
] as const

function withoutLocationProperties(properties: CaptureResult['properties']): CaptureResult['properties'] {
  const sanitized = { ...properties }
  for (const property of LOCATION_PROPERTIES) delete sanitized[property]
  for (const container of ['$set', '$set_once'] as const) {
    const nested = sanitized[container]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      sanitized[container] = withoutLocationProperties(nested)
    }
  }
  return sanitized
}

export function stripAnalyticsLocation(event: CaptureResult | null): CaptureResult | null {
  if (event === null) return null
  return {
    ...event,
    properties: withoutLocationProperties(event.properties),
    ...(event.$set ? { $set: withoutLocationProperties(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: withoutLocationProperties(event.$set_once) } : {}),
  }
}

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
      // Auth and pairing deep links contain opaque one-time handles in their
      // path/query. Page navigation is therefore never captured automatically.
      capture_pageview: false,
      capture_pageleave: false,
      // PostHog's feature-flag request does not pass through before_send and
      // otherwise includes the initial browser URL as person properties.
      // Palladin does not consume client-side flags, so disable that channel
      // and prevent the SDK from persisting campaign/referrer URLs.
      save_campaign_params: false,
      save_referrer: false,
      advanced_disable_feature_flags: true,
      advanced_disable_feature_flags_on_first_load: true,
      // Manual captures are enriched with the current location by the SDK.
      // Strip every location/referrer field after enrichment so opaque auth and
      // pairing handles never leave the browser through telemetry.
      before_send: stripAnalyticsLocation,
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
