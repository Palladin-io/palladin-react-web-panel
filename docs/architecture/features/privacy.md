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


## Explicit startup choice and settings (CVT-609, 2026-09-13)

The startup presentation is a modal, not the settings page. Web reuses ModalShell
with focus trapping over the safe pre-verification/key-setup surface; eligible
first entry can offer it over the authenticated shell. Mobile uses a root-native
bottom sheet before the existing setup/verification guards. An unknown account
choice can be offered once per running session; dismissing is only a UI state,
not a stored denial or permission. The user can continue without optional consent.

Essential is informational and always active, without a switch. Product analytics
and email news/offers start off when unknown. Switches edit a draft, then equal
Essential only / Save choice actions commit the two purposes. Full current notices
remain expandable before deciding; short explanatory labels do not replace the
backend notice version/text or activate the empty release catalogue.

The two existing endpoints are not atomic. Save processes the decisions in order,
reports no overall success on partial failure and retains only unconfirmed decisions
for an identical idempotent retry. Turning analytics off suspends local capture
before Save. Errors and dismissal fail closed. Saving an unrelated marketing change
never activates a previously inactive installation. Settings shows a simple local
on/off status and an explicit Enable on this device action; only the initial
analytics grant or that activation action enables the current installation.

The debug preview uses real widgets/components and the normal consent data path
against a local synthetic API. It is visibly labelled TEST FIXTURE. It cannot run
as a released preview and never configures an analytics key. Production entrypoints,
active notices, authentication and release configuration are unchanged.

Consent is the explicit exception to the usual confirm/cancel 1:2 footer ratio:
both actions keep flex-1 and the same height; Save uses the brand accent variant
and Essential only uses subtle. The first-entry prompt takes
precedence over the existing developer-benefit dialog, so modal layers do not stack.

## Compact surface and primary Save (owner feedback, 2026-09-13)

Startup ModalShell and embedded Settings both use DialogSurface at width 480 design pixels
(600 CSS pixels at the current 1.25 density), within the approved 560–640 range.
SettingsSectionPage omits its optional hidden title when the surface owns the
single Your privacy heading and subtitle. Both reuse the same category cards,
spacing and divided footer. Red Save commits the current selection, including
explicit denials for both unknown purposes without touching either toggle.
It is enabled once the query/notices permit a write, not gated on a dirty form.
Empty notices remain unavailable. Red does not mean a preselected grant.
Redundant saved-status lines were removed; toggles show the current/draft choice
and Settings retains the per-device state and explicit activation control.
