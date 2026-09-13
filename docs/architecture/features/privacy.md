# Account privacy and client analytics

Identity owns the current consent and its history. The web client exposes a
separate `/privacy-choices` step after password registration or an OAuth response
with `isNewUser: true`, and an Account → Privacy section at `/settings/privacy`.
The OAuth step preserves the requested deep-link destination. Both optional
purposes can remain off, and continuing does not imply a grant.

`ConsentChoices` renders the server's current PL/EN notice and keeps save failures
visible. The mutation includes expected revision, request ID, notice version,
notice language and `web_onboarding`/`web_settings`. An ambiguous network/transient
failure retains the identical request for retry. Mutations use `networkMode: 'always'`
and `retry: false`, rejecting known offline saves before the PUT instead of pausing
in TanStack's reconnect queue. The failure restores Retry and Close/Escape/backdrop
immediately; reconnect never submits a decision. Explicit retry retains the original
request IDs and unconfirmed remainder. An offline confirmation cannot activate
analytics, even if a preceding PUT succeeded.
A definitive rejection (including HTTP 409 revision conflict) awaits an authoritative
refresh, discards pending requests and resets the draft. The form explains that the
user must review/reconfirm; failed refresh keeps saving disabled until a successful
read. A new decision uses the current revision and a new request ID. The response is
not treated as a successful local activation until the account session is still
current and the preceding cached consent query has been refreshed.

`ConsentRuntime` is mounted once at the router root. Consent reads and runtime
activation require a matched route with `staticData.consentSession: true`, declared
only on the session-guarded `_authenticated` layout (including unlock and Settings),
`/privacy-choices` and `/recovery`. Public routes default off: `/login`, `/register`,
`/verify-email` both with and without a token, dev and unmatched routes never start
consent reads or restore a persisted session through optional consent. New public
routes inherit that default without a pathname denylist. Leaving an eligible route
cancels consent queries and resets transport; cached grants cannot bypass the gate.
On eligible routes `useConsents` fetches after login, on focus/reconnect and every
30 seconds. A snapshot expires according to server `maxAgeSeconds` (60 by default,
maximum 300); the deadline starts before the read, not after a slow response.
Unavailable, expired, denied, withdrawn or mismatched notice/activation state
means no collection. Offline/pagehide, logout and account replacement reset the
transport. Consent changes never lock the Vault or alter business/audit events.

Account consent is separate from local activation. localStorage holds only a
notice version, notice locale and `activationRevision` under an account-scoped
preference key.
The settings status and runtime share `matchesCurrentAnalyticsActivation`: local
version/locale must match both the account grant and the current notice, and the
activation epoch must match. Old records without a locale stay off until explicit
reactivation; changed notices expose Enable on this device.
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
outlined Save choice / brand-primary Accept all actions commit decisions.
Save preserves the switches; Accept all explicitly grants both purposes. Full current notices
remain expandable before deciding; short explanatory labels do not replace the
backend notice version/text or activate the empty release catalogue.

The two existing endpoints are not atomic. Save processes the decisions in order,
reports no overall success on partial failure and retains only unconfirmed decisions
for an identical idempotent retry. Turning analytics off suspends local capture
before Save. Errors and dismissal fail closed. Saving an unrelated marketing change
never activates a previously inactive installation. Settings shows a simple local
on/off status and an explicit Enable on this device action; only the initial
analytics grant, Accept all, or that activation action enables the current installation.

The debug preview uses real widgets/components and the normal consent data path
against a local synthetic API. It is visibly labelled TEST FIXTURE. It cannot run
as a released preview and never configures an analytics key. Production entrypoints,
active notices, authentication and release configuration are unchanged.

Consent is the explicit exception to the usual confirm/cancel 1:2 footer ratio:
both actions keep flex-1 and the same height; Save uses outline and Accept all
uses the brand accent variant. The first-entry prompt takes
precedence over the existing developer-benefit dialog, so modal layers do not stack.

## Dialog-only startup and settings (owner decision, 2026-09-13)

ConsentChoices always renders ModalShell (600 CSS px at the default density),
including settings edits. The source selects the settings-only device status and
activation controls; the presence of a completion callback does not select layout.
The form never appears as an embedded panel on the Settings page.

The /settings/privacy route auto-opens once per mount, over SettingsLayout and the
existing authenticated shell. Closing by Escape, backdrop or Close leaves a small
Manage choices launcher and restores focus to it. Save/Accept all close after
successful completion. An unchanged valid choice can close without a fabricated
write; unknown off choices still produce explicit denials. Reopening is deliberate;
query refreshes do not reopen a closed dialog. Browser Back keeps normal routing.
PrivacyPrompt yields this route completely (including the benefit fallback), and
the explicit visit marks only the ephemeral first-entry prompt dismissal. It is
not account consent and cannot enable collection.

Save is outlined secondary, Accept all brand primary, with equal geometry. Defaults
remain off for unknown optional purposes. Settings shows the existing server
choice and per-device state, full notice details and explicit local activation.
Dismissal stops the local transport/activation without changing the account;
failed/partial saves stay in the modal with retry. All active notice/release gates
are unchanged. The local preview now uses the actual SettingsLayout and TanStack
routes to verify Back/navigation, while still using isolated synthetic API data.

## Two-action footer (final owner decision, 2026-09-13)

Startup and settings have exactly two footer actions: Save choice (outlined) and
Accept all (brand red), with equal width/height. Unknown optional choices still
start off; untouched Save records two explicit denials when notices are available.
There is no Essential only footer action. Close/Escape/Back never create consent.

Accept all requires both current notices and forces two affirmative decisions,
even for existing account grants. It first stops local analytics, confirms marketing,
then confirms analytics through the existing installation activation mechanism.
Thus a partial failure leaves capture off and the dialog open; retry uses only the
unconfirmed remainder with the original request IDs. Successful retry activates
this installation only after both decisions are confirmed. The endpoints remain
non-atomic; a confirmed account decision is not rolled back or hidden on failure.
Ordinary Save also confirms marketing before an analytics grant and suspends
local activation before the batch, so either failure stays off until the whole
retry completes. Analytics withdrawals still run first. Unrelated marketing saves
do not activate an inactive installation. No backend,
canonical notices, marketing pipeline, telemetry scope or release gates changed.


## Email marketing copy and draft detail ownership

The category is Email marketing / Marketing e-mailowy. Its one-line description identifies Palladin news/offers by email; the expanded
three-sentence notice explains that essential transactional, account and security
messages do not depend on marketing consent. This does not implement a
marketing sender. Full PL/EN details come from Identity's versioned catalogue;
clients do not own or rewrite the notice. Controller identity/contact remain in
the linked legal documents. Draft review uses the same details only in a marked
localhost fixture; it does not populate the empty embedded active catalogue.
