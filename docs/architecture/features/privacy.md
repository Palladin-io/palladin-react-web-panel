# Account privacy and client analytics

Identity owns the current consent and its history. The web client exposes a
separate `/privacy-choices` step after password registration or an OAuth response
with `isNewUser: true`, and an Account → Privacy section at `/settings/privacy`.
The OAuth step preserves the requested deep-link destination. Both optional
purposes can remain off, and continuing does not imply a grant.

`ConsentChoices` renders the server's current PL/EN notice and keeps save failures
visible. The mutation includes expected revision, request ID, notice version,
notice language and `web_onboarding`/`web_settings`. An identical failed attempt
can be retried; a later user decision creates a new request ID. The response is
not treated as a successful local activation until the account session is still
current and the preceding cached consent query has been refreshed.

`ConsentRuntime` is mounted once at the router root, including onboarding and
other auth routes. `useConsents` fetches after login, on focus/reconnect and every
30 seconds. A snapshot expires according to server `maxAgeSeconds` (60 by default,
maximum 300); the deadline starts before the read, not after a slow response.
Unavailable, expired, denied, withdrawn or mismatched notice/activation state
means no collection. Offline/pagehide, logout and account replacement reset the
transport. Consent changes never lock the Vault or alter business/audit events.

Account consent is separate from local activation. localStorage holds only a
notice version and `activationRevision` under an account-scoped preference key.
A continuous grant keeps its epoch; withdrawal/regrant changes it. Therefore
several devices can be explicitly active, while old activations cannot resume
after a later withdrawal. A new browser starts off even if the account is granted.
No anonymous landing preference or visitor ID is imported. Storage failures fail
closed in the current session; no key material or analytics session is persisted.

The `posthog-js` dependency was removed. `shared/lib/analytics.ts` sends narrowly
allowlisted UI events directly to the EU capture API, with no SDK initialization,
autocapture, replay, flags, automatic errors, identify/profile calls or GeoIP.
Caller properties are deliberately omitted. Generic page views carry TanStack
route templates, never actual parameter values, URLs, query strings or fragments.
A random session ID exists only in memory after valid permission. Requests omit
credentials/referrer, reject redirects, time out after five seconds, and are
cancelled on reset. There is no offline queue or retry. API headers retain only
`x-platform: web`; they never attach device/session analytics metadata.

Bootstrap removes old PostHog local/session storage and cookies without loading
the old SDK. CSP permits only the EU `/i/v0/e/` capture path. Public configuration
uses empty project keys; `VITE_CLIENT_ANALYTICS_RELEASED` defaults to false. A key
alone never enables collection. Staging and production must use separate projects.

The Identity catalogue remains unavailable until the final legal release review.
Missing notices disable new grants while known older grants remain withdrawable.
No marketing sender is implemented. Production collection stays off until the
approved notices, PL/EN public documents and retention/objection requirements are
released together.

Validation includes transport payloads/cancellation, local storage failure,
account changes, stale retries, integrated runtime/form sequencing, optional
onboarding and API error states. Browser QA covers PL/EN landing and web
onboarding at desktop/phone widths plus desktop settings. The existing full-width
application sidebar does not provide a usable phone layout for settings; the
native mobile Privacy surface is separately implemented and tested.
