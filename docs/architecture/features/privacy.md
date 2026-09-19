# Account privacy and client analytics

Identity owns the current consent and its history. `PrivacyPrompt` offers optional
choices over the authenticated application on its first eligible entry, after
registration, email verification and key setup/unlock. Registration and new OAuth
sessions resume normal auth guards and preserve their requested destination.
The legacy `/privacy-choices` URL only redirects through those guards; it never
renders a form or starts consent reads. Later edits live at `/settings/privacy`.
Closing a prompt does not imply a consent decision.

An automatic offer needs at least one unknown purpose with a current notice.
An empty catalogue never interrupts entry or records dismissal; a later successful
read may offer the choices. Once opened, partial saves and failed refreshes retain
the form and retry state. Dismissal is remembered only for this account session.

`ConsentChoices` renders the client-owned current PL/EN notice and keeps save failures
visible. The mutation includes expected revision, request ID, notice version,
notice language and `web_onboarding`/`web_settings`. An ambiguous network/transient
failure retains the identical request for retry. Mutations use `networkMode: 'always'`
and `retry: false`, rejecting known offline saves before the PUT instead of pausing
in TanStack's reconnect queue. The failure restores Retry immediately; settings
also restores Close/Escape/backdrop. Reconnect never submits a decision. Explicit retry retains the original
request IDs and unconfirmed remainder. An offline confirmation cannot activate
analytics, even if a preceding PUT succeeded.
A definitive rejection (including HTTP 409 revision conflict) awaits an authoritative
refresh, discards pending requests and resets the draft. The form explains that the
user must review/reconfirm; failed refresh keeps saving disabled until a successful
read. A new decision uses the current revision and a new request ID. The response is
not treated as confirmed until the account session is still
current and the preceding cached consent query has been refreshed.

`ConsentRuntime` is mounted once at the router root. Consent reads and runtime
activation require a matched route with `staticData.consentSession: true`, declared
only on the session-guarded `_authenticated` layout (including unlock and Settings),
`/recovery`. Public routes default off: `/login`, `/register`,
`/verify-email` both with and without a token, dev and unmatched routes never start
consent reads or restore a persisted session through optional consent. New public
routes inherit that default without a pathname denylist. Leaving an eligible route
cancels consent queries and resets transport; cached grants cannot bypass the gate.
Invalidating a snapshot immediately removes its capture authority. A mutation that
finishes on a public route cannot reuse the cached grant on return: a completed
authenticated GET in the current login generation is required.
On eligible routes `useConsents` fetches after login, on focus/reconnect and every
30 seconds. A snapshot expires according to server `maxAgeSeconds` (60 by default,
maximum 300); the deadline starts before the read, not after a slow response.
Unavailable, expired, denied, withdrawn or mismatched notice version
means no collection. Offline/pagehide, logout and account replacement reset the
transport. Consent changes never lock the Vault or alter business/audit events.

Account analytics consent automatically applies on every signed-in web/mobile
installation after a fresh authenticated response for the accepted notice version.
No device activation, browser preference, localStorage entry or mobile cache file
is required. Old activation records are ignored. Changing language does not revoke
an accepted version. A different current notice version still requires explicit Save.
Unknown, denied and withdrawn choices never authorize capture.

A form holds a memory-only suspension while editing a withdrawal or saving a batch.
Polling cannot override that suspension. Successful completion releases it;
closing/cancelling the form discards its draft and resumes the saved account choice
within the normal freshness/lifecycle rules. Closing Privacy never revokes a grant.
Failed writes remain visible with an explicit retry; no reconnect queues a decision.
Account replacement and logout invalidate in-flight reads/writes.

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

The client ships its current notices independently of the receipt API. Failed
receipt reads still prevent writes; known older grants remain withdrawable.
No marketing sender is implemented. Production collection stays off until the
approved notices, PL/EN public documents and retention/objection requirements are
released together.

Validation includes transport payloads/cancellation, fresh-install account grants,
account changes, stale retries, integrated runtime/form sequencing, optional
onboarding and API error states. Browser QA covers PL/EN landing and web
onboarding at desktop/phone widths plus desktop settings. The existing full-width
application sidebar does not provide a usable phone layout for settings; the
native mobile Privacy surface is separately implemented and tested.


## Account consent decision — 2026-09-19

This decision supersedes all historical references below to per-installation
activation, local on/off status and dismissal disabling capture. The UI has only
the account switches, expandable notice details and Save choice / Accept all.
Capture still requires the independently configured analytics release flag and
project key. Removing device activation does not publish or enable that configuration.
The API receipt contract, archived notice texts, event scope and transport stay unchanged.

## Historical presentation decisions

The dated sections below retain the previous design record. Their per-device
activation behavior is superseded by the account-consent decision above.

## Explicit startup choice and settings (CVT-609, 2026-09-13)

The startup presentation is a modal over the ready authenticated application,
after setup, verification and unlock. Web uses ModalShell; mobile uses a
root-native bottom sheet. An unknown account
choice can be offered once per running session; dismissing is only a UI state,
not a stored denial or permission. The user can continue without optional consent.

Essential is informational and always active, without a switch. Product analytics
and email news/offers start off when unknown. Switches edit a draft, then equal
outlined Save choice / brand-primary Accept all actions commit decisions.
Save preserves the switches; Accept all explicitly grants both purposes. Full current notices
remain expandable before deciding; short explanatory labels do not replace the
versioned full notice. The backend registry contains version metadata only.

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
authentication and processing release configuration are unchanged.

Consent is the explicit exception to the usual confirm/cancel 1:2 footer ratio:
both actions keep flex-1 and the same height; Save uses outline and Accept all
uses the brand accent variant. The first-entry prompt takes
precedence over the existing developer-benefit dialog, so modal layers do not stack.

## Dialog-only startup and settings (owner decision, 2026-09-13)

ConsentChoices always renders ModalShell (550 CSS px at the default density),
including settings edits. The source selects the settings-only device status and
activation controls; the presence of a completion callback does not select layout.
The form never appears as an embedded panel on the Settings page.

Settings menu activation opens `PrivacySettingsDialog` above the mounted section,
without changing its route, selection, scroll position or unsaved input. Close,
Escape, backdrop and successful Save return to that same section and restore
focus to the trigger. Ctrl/Meta/middle-click retain the normal link destination.
Direct entry at `/settings/privacy` renders Security behind the dialog; closing
replaces the URL with `/settings/security`. No empty Privacy page or launcher is
left behind. `PrivacyPrompt` yields the explicit privacy route and the settings
dialog marks the ephemeral account offer handled, preventing a second prompt.
This presentation state never records consent or enables collection.

Save is outlined secondary, Accept all brand primary, with equal geometry. Defaults
remain off for unknown optional purposes. Settings shows the existing server
choice and per-device state, full notice details and explicit local activation.
Dismissal stops the local transport/activation without changing the account;
failed/partial saves stay in the modal with retry. Processing release gates remain separate from receipt storage. The local preview now uses the actual SettingsLayout and TanStack
routes to verify Back/navigation, while still using isolated synthetic API data.

## Two-action footer (final owner decision, 2026-09-13)

When decisions are available, startup and settings have two footer actions: Save choice (outlined) and
Accept all (brand red), with equal width/height. Unknown optional choices still
start off; untouched Save records two explicit denials when notices are available.
There is no Essential only footer action. Close/Escape/Back never create consent.

The first-entry dialog has no header Close action and ignores Escape/backdrop
dismissal. Users finish it by saving their choices (including both off) or accepting
all. Settings retains normal dismissal. An unavailable catalogue, failed read or
failed startup save still offers Continue without recording another decision or
queuing a reconnect write, so this presentation rule cannot trap users behind
unavailable optional services. Automatic entry remains gated on
an available current notice.
The failure exit is scoped to the account and language outside the notice-keyed
form, so a refreshed notice version resets draft decisions and retries without
removing Continue after a rejected save.
Failure Continue lives in the pinned modal footer, in a full-width secondary row
below the existing equal Save/Accept actions, so expanded notices cannot scroll
the escape action out of view.

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


## Email marketing copy and detail ownership

The category is Email marketing / Marketing e-mailowy. Its one-line description identifies Palladin news/offers by email; the expanded
three-sentence notice explains that essential transactional, account and security
messages do not depend on marketing consent. This does not implement a
marketing sender. Full PL/EN details come from the client catalogue, with an immutable version
and a matching archive in `docs/consent-notices/`. Identity stores the decision receipt. Controller identity/contact remain in
the linked legal documents. The original draft.3 wording is retained exactly in the first client-owned version.

## Ready-app entry and compact dialog (owner decision, 2026-09-15)

This entry timing replaces the former post-registration privacy step. The dialog
uses shared ModalShell/DialogFooter/Button/ToggleSwitch controls, an Essential summary
above two stacked bordered cards. A heading button with a chevron expands each
current client notice independently from its switch. Disclosure uses aria-expanded,
aria-controls and an inert collapsed panel, animated with reduced-motion support.
The voluntary-choice note follows the cards with symmetric spacing. Full server
notices remain keyboard-accessible; localized policy links open the published
analytics/marketing section in a new tab with noopener/noreferrer, retaining the form. No consent is granted by opening or
closing the UI. In settings, an unavailable catalogue or failed read shows an
active Continue action instead of a footer containing only disabled save actions.
A failed read also retains Reload. During writes, dismissal remains blocked until
the outcome is known; partial/transient failures retain explicit retry.


## Client-owned notices and version receipts (2026-09-18)

The client displays its own PL/EN notice and submits the exact displayed
`noticeVersion`, locale, purpose and choice. Version `2026-09-18T00:00:00Z`
identifies the first client-owned release and its UTC effective-from instant.
Identity returns receipt state without `currentNotice`; the data adapter attaches
the local notice. A legacy response's text cannot override the bundled wording.

`docs/consent-notices/2026-09-18.json` archives the exact four texts and pins the
linked policies. Tests compare every localized notice with this archive. Never
edit published text under the same version: add a new archive and matching
backend metadata entry before releasing a new client notice.

The server records authenticated user, purpose/scope, choice, displayed version,
locale, source and its own UTC timestamp. It rejects unknown or future versions
and never infers the displayed version from the acceptance time. An older
installed client may still submit a known effective older version. Existing
revision fencing, retries, history and withdrawals remain unchanged.

An explicit Save records an updated displayed version even if its switch value
has not changed. Enable on this device reconfirms analytics without reconfirming
an unchanged marketing choice. Reading a receipt or updating the client version
never constitutes consent. Receipt storage does not enable analytics release
flags or add a marketing sender.
