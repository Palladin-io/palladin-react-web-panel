# Feature: auth

**Path:** `src/features/auth/`

## What it does
The entry point to the app. Two ways in:

- **OAuth 2.0** via `@react-oauth/google`'s **implicit token flow** (Google primary, Apple/X stubbed). Google returns an `access_token` in the browser, POSTed to `/api/auth/oauth/google` for the app JWT. Implicit-token flow, not auth-code/PKCE — no backend code-exchange endpoint today; if one lands, switch `useGoogleLogin` to `flow: 'auth-code'`. OAuth accounts are always `emailVerified: true`.
- **Email + password** uses Identity password KDF v1. The browser runs the exact UTF-8 password through the registered Argon2id profile once and domain-separates AuthCredential from MK. AuthCredential is sent to the server; password and MK never are. Unsupported profiles fail closed; there is no legacy fallback.

Session-token storage: the access token is kept **in memory only** (never persisted); only the refresh token is persisted (localStorage) so a reload can silently restore the session via the ky client's 401→refresh path. Idle + absolute session timeouts (`useSessionTimeout`) wipe the keys and access token on walk-away. Moving the refresh token to an httpOnly cookie is a backend-coordinated follow-up.

## How it's organized
- **`components/login-page`** — step machine (`credentials` → optional `totp`). The v1 handshake validates the bootstrap, derives once before TOTP, and verifies the authenticated account KDF state before unlock.
- **`register/`** — credentials followed by recovery phrase display/confirmation. `use-register` generates a client AccountId, posts only v1 AuthCredential plus wrapped key material, and lands the user unlocked. Route `/register`.
- **`verify-email/`** — `/verify-email?token=` result screen (verifying / verified / expired / invalid) via `use-verify-email`. `VerifyEmailBanner` (soft, server-authoritative on `account.emailVerified === false`) is pinned in the authenticated layout with a throttled resend (`use-resend-verification`, fires `fe:auth:verification-email-resent`). Verification never hard-blocks the app — the backend gates sensitive actions independently.
- **Waitlist Developer benefit** — a celebratory acknowledgement dialog appears while the backend-reported personal benefit is active and stays open until its CTA is used. The authenticated shell presents the active level as Premium (including the sidebar label and avatar border), shows a human-readable end date and removes that presentation at expiry. Exact benefit timestamps remain memory-only; after explicit acknowledgement, `sessionStorage` holds only an opaque hash scoped to the user and exact benefit period, and session cleanup removes it.
- **`security/`** — `SecurityPage` (route `/_authenticated/security`, linked from Settings): change master password (`use-change-master-password` — verify current AuthCredential and rewrap under a fresh-salt MK; recovery phrase untouched) and TOTP 2FA (`use-totp` enroll/confirm/disable; QR via `shared/components/qr-code`, recovery codes shown once).

## Key patterns
- **Auth-surface conventions:** the persisted app theme flows through `.auth-surface` and `--cv-auth-*` tokens; no auth route creates a nested dark scope. `AppWordmark` / `AuthSubmitButton` / `AuthStepShell` (shared) provide the hero chrome. Master-password fields use `FormInput type="password"` (the browser *should* offer to save the account password), unlike vault secrets which use `SecretInput`.
- **Crypto isolation:** every derive/wrap/unwrap happens in a feature hook calling `shared/crypto` helpers; MK and private key land in Zustand memory only, are excluded from `persist.partialize`, and owned temporary buffers are wiped in `finally`.
- **`useAuthStore` (Zustand) is the session source of truth:** JWT, userId, permission bits, `isVaultLocked`, `isOnboarded`, `emailVerified` (never regresses true→false), and the active waitlist Developer start/end window. The benefit window is memory-only and is restored by the next session response, never by persistence. Session mutations write straight to Zustand, not through queries.
- **Login/logout cleanup:** a new password or OAuth login first clears the previous auth state, in-memory keys, TanStack query/mutation caches, decrypted member-sync state, and analytics identity. Logout performs the same cleanup centrally and then hard-reloads `/login`, which also terminates pending browser work. Unlocking an existing session does not run this cleanup.
- **Refresh hand-off:** refresh responses are accepted only by the client-session generation that started them, so a delayed response from the previous account cannot restore its tokens after cleanup. The encrypted IndexedDB Vault cache remains user-scoped while the account is locked, but logout and account switching delete every active and staging namespace for the previous profile before the next session starts.
- **Verification/session binding:** consuming an e-mail token mutates the current browser session only when the response `userId` matches it. The verified response applies any active benefit window to memory immediately, then a matching session refreshes so the new plan claim and permissions take effect; generation, user and refresh-token fences reject stale refresh responses. A failed refresh is retried once. If both attempts fail, verification still succeeds but that same fenced client session is cleared before navigation, so the next login obtains current authorization claims instead of presenting Premium with stale permissions.
- **Crypto-session cache namespace:** `cryptoSessionGeneration` is a non-secret, non-persisted counter advanced on every unlock, lock, expiry and logout. Queries containing authenticated Vault/Entry ciphertext include it in their cache key so a new in-memory key session never reuses a crypto envelope fetched by an older session. Raw keys are never query-key material.
- **Deep-link return:** when an anonymous user opens an authenticated URL, the guard carries its full internal path, search, and hash through `/login?redirect=…`. Every successful login method returns to that target; the vault-lock guard then carries the same target through `/unlock` when needed. Failed refresh recovery unwraps an existing auth-gate redirect instead of nesting or dropping it. `shared/lib/auth-redirect` rejects external, malformed, and auth-loop targets before navigation.

## Cross-feature deps
`useAuthStore` is consumed by **every** feature for JWT, permissions, and lock state — the one acceptable cross-cutting store. Route guards key off its `isVaultLocked` / `isOnboarded` flags. Registration and onboarding share `shared/lib/create-default-vault-safe` (relocated from onboarding so both entry paths can seed the default vault without a feature→feature import).


## Shared-unlock session limits (implementation increment)

The auth store now owns memory-only original unlockedAt, idle, absolute and offline
ceilings. Manual unlock keeps the existing 15-minute idle/eight-hour absolute
policy. A caller installing an inherited unlock can supply its verified remaining
limits; Web additionally caps them by its own policy measured from original
unlockedAt. An expired result cannot publish keys. Lock, expiry and logout clear
the limits with the keys; refresh and a layout remount do not reset them.

`useSessionTimeout` reads this state, checks on mount/pageshow/visibility and the
existing bounded poll, and accepts only browser-trusted local interaction as idle
activity. Events are coalesced to at most one update per second. Storage restoration
selects only the existing durable Identity fields; injected keys, access tokens,
lock flags and limit metadata cannot restore unlocked state.

This increment is preparation for CVT-583. Browser routing, own receiver token
installation/Identity authority, coordinated lock/logout/preference and full
platform acceptance are not wired by these changes.

## Manual source authority for shared unlock (implementation increment)

Password login (including TOTP) and password unlock prepare an own Identity
shared-unlock authorization after installing their independently verified local
keys. Only the fresh AuthCredential and that Web session's JWT/refresh token go
directly to the configured Identity API; MK/private key never enter the request.
The dedicated adapter does not follow redirects, attach cookies, retry a proof or
trigger the generic 401 refresh flow. Account preference is read, never changed:
explicit OFF stays OFF. An authorization can be prepared while OFF, but this
alone cannot bind a link or hand off keys. A failed request or required step-up
leaves the ordinary local unlocked session intact and sharing unavailable.

The source generation and authorization stay in module memory. Preparation is
bounded by a ten-second abort deadline; lock/expiry/logout/new key session abort
pending requests and wipe the proof. Late responses also check current account,
API environment, key generation and local deadlines. The instance/subscription
is initialized only when a manual source is actually prepared. No new persistent
fields or API response business validators are introduced.

TOTP keeps independent MK/AuthCredential buffers in the existing pending hook
state for at most five minutes, bound to its exact challenge. Back/cancel,
unmount, lock, logout, expiry and successful use clear those buffers. Failed TOTP
can be retried while the same bounded attempt remains valid. A shared manual
attempt counter plus client/crypto session generations fence late login/unlock
results before tokens/keys are published; failure from a superseded attempt does
not clear the newer session. Crypto generation now also changes on lock/expiry,
even when the vault was already locked.

Shared provider fixtures cover preference and authorization response shapes in
this adapter. Receiver operations, browser routing, own-activity synchronization,
link/preference UI and the platform matrix remain in progress; this preparation
is not yet a complete Web-to-extension handoff.

## Receiver primitives for shared unlock (implementation increment)

The Web dependency is pinned to published `@palladin/crypto` 0.7.0. The local
`shared/crypto/shared-unlock-keys` helper uses that package to bind Identity's
key descriptor to the operation digest and independently selected account,
recover the member private key and compare its derived public key with Identity's
committed public key. It owns the supplied temporary MK, checks the caller's
synchronous lifecycle fence around every await and wipes temporary material on
failure. No crypto is implemented in the auth feature or browser adapter.

The dedicated API adapter now supports receiver consume/commit over its own
configured Identity connection. Only the receiver's operation signature is sent:
no bearer, cookies, redirected request, generic refresh or automatic proof retry.
Returned sessions remain typed first-party contracts; the adapter does not
restate Identity's domain rules. Shared fixtures cover both operation responses
and all 32 commit response variants.

`auth-store.installSharedUnlock` atomically publishes the receiver's own token
response, independent key copies and original remaining limits in one state
update. Its compare-and-set fence is the previously captured receiver account,
tokens and crypto generation; a different account, refresh, lock, expiry, logout
or unlock invalidates that capture. The local policy still clamps inherited
limits and rejects exact-deadline expiry before any new tokens/keys are exposed.
Only the existing durable Identity fields are persisted. Input key buffers remain
owned by the caller, which must wipe them in its finally block.

If synchronous persistence/subscribers fail after publication, allocated key
copies are wiped and only that new lineage is rolled back to the prior locked
session. A concurrent logout or other login is preserved; expiry does not regain
an access token. If an observer has already rotated tokens before throwing,
those tokens are preserved but any still-owned crypto state is locked and cleared.
The action returns its installed generation for the future
coordinator's final route/ACK check.

These primitives are used by the browser-independent receiver transaction below.
An actual browser adapter must establish independent route/account/organization/
lifecycle authority before invoking it. Linking, shared manual lock/logout and
browser acceptance remain unfinished. No incoming page message invokes it yet.


## Browser-independent receiver transaction (implementation increment)

`shared-unlock/receiver.ts` now runs consume → open/recover → commit → atomic
installation → final synchronous route check/ACK. It captures the existing locked
or signed-out session, client/crypto/manual-attempt generations, API environment
and a copy of the browser adapter's independently established route/link binding
before generating public DH/proof offers. The adapter must supply current trusted
account/org/document/extension/generation/link/epoch/preference authority, never
build those expected fields from the offer or encrypted envelope being checked.
It must reject navigation, OFF, revoke, peer loss and changed local scope in its
synchronous route fence. The transaction cannot authenticate a browser itself.

All signing, transcript hashing, ephemeral DH and envelope/key recovery stay in
`shared/crypto/shared-unlock-receiver` and the published crypto package. The public
source key must come from the verified browser channel; recipient DH and proof
keys are generated locally. The offered transcript is bound before consume is
signed. Identity's own consume response supplies the descriptor and expected
crypto context; it must match that proof and the independent route/participants.
The received envelope is checked against that authority, and the commit transcript
is checked before any key/token publication. No AuthCredential or source bearer
is accepted in this flow.

The operation owns a thirty-second local timeout and an abortable wait for browser
or REST results. Lock/logout/expiry cancel pending work immediately; every later
crypto/network result also checks the captured session, environment and manual
attempt. An unused/cancelled receiver disposes offers, signing material, timers
and subscriptions. Temporary MK/private-key buffers are wiped after every outcome;
completed handles drop captured old/new session references. Duplicate receive does
not renew or wipe an already completed session. Peer loss after completion does
not lock that independently valid session.

Commit observes an available issued response body before rejecting a late result,
so cancellation/environment changes do not silently discard a usable cleanup token.
A failed receiver attempts ordinary logout only for its newly issued own refresh
token, on the original captured Identity URL. This dedicated best-effort cleanup
has a separate two-second deadline, no bearer/cookies/redirects/retry and does not
call the client's global logout or linked group logout. If the response never
becomes available, the client has no token to revoke; it still installs no keys.
A failed final route check rolls back only the newly installed lineage to the
previous locked snapshot; other logins/logout and expiry remain authoritative.

The internal successful result contains operation/root IDs, sequence and local
crypto generation. The wire ACK contains only operationId plus the exact Web and
Extension RAM generations, as required by protocol `session-api.md`. Successful
installation and the final authority check complete the receiver before ACK is
sent. ACK loss/port closure therefore preserves the valid own session; there is
no ACK retry or durable queue, and duplicates cannot install again. The pre-release browser coordinator now invokes these transactions and adopts
verified receiver authority. Own activity, closing/expiry/preference lifecycle
and UX remain release gates. Tests use real crypto and
verify both signatures, wrapped member/Vault keys and an encrypted synthetic Entry
primitive through the installed private key, with a mocked Identity transport.
This is not a browser/platform proof or acceptance of the current Member-sync
Entry flow on distributed artifacts; those E2E gates remain open.

## Chromium application channel (implementation increment)

The app-root `SharedUnlockBrowserProvider` now starts a document-owned channel
on login, unlock and authenticated routes when the optional public deployment
value `VITE_SHARED_UNLOCK_EXTENSION_ID` is explicitly set. Its committed template
is empty. The Web calls the browser's native `runtime.connect` with that exact ID;
an ID in a ready payload is only a consistency check, never recipient authority.
The configured own API URL, own Web origin and locally generated request nonce
must match the strict Zod hello/ready boundary. Extra account/key/token fields,
wrong protocol, correlation or environment are rejected. No window-message bridge,
remote extension script or extension iframe is introduced.

Each route exposes an abort signal and synchronous current-document fence.
Peer disconnect, timeout, malformed/repeated ready, document retirement and effect
teardown permanently retire its route. Pending crypto/session work must subscribe
to that signal when the source/receiver coordinator is connected. A failed channel
never calls logout, expires an own session, updates user activity or changes
sharing preference. Foreground reconnect backs off from one to thirty seconds;
background reconnect waits for visibility. A new connection gets a new nonce and
browser channel/document binding, not a replacement source-authorization generation.

`pagehide` can preserve JS in BFCache: the provider closes the channel and invokes
the existing local `expireSession` key/access-token wipe immediately. It preserves
the own account/refresh lineage and makes no group/manual lock/logout request.
`pageshow` can establish a fresh channel; the old route remains invalid. React
effect teardown only closes transport, so remount/StrictMode cannot expire an
otherwise valid own session. Iframes and prerendering cannot open this route.

The Extension harness supports an explicit `--web-source /path/to/web-repository`
option: it builds both real products with synthetic local public configuration,
serves the Web build with its actual `_headers`, and observes native Port calls
without replacing their browser routing. On Chromium 153/macOS arm64, Web bootstrap
and reload passed alongside the nine extension channel checks. There is no login,
Identity request or MK transfer in that probe; deployed artifacts and the full
browser/OS matrix remain unverified. The ordinary extension CI uses its standalone
nine-check mode; it does not fetch a private Web repository.

These channels are not yet connected to `receiver.ts` or a source transaction.
Account/link/preference authority, inherited source/own activity, shared manual
lock/logout and UI still require implementation. Hello/ready is not feature completion.

## One-shot Web source transaction (implementation increment)

`shared-unlock/source.ts` now captures the independently selected browser/link
route, own current Identity session, manual/client/crypto generation and original
source authorization before generating its DH offer. A browser nonce cannot
replace the own source generation. The route owner must abort on peer loss,
closing intent, OFF/revoke and document retirement; every async boundary also
checks current own keys/tokens, account/organization, root identity/key revisions,
preference revision and original/local deadlines. An unused operation expires
after thirty seconds; cancellation does not wait for a transport that ignores abort.

`SharedUnlockApi.createOperation` sends only the source's own bearer/refresh
lineage and captured public request fields, including all three effective local
ceilings, to its own Identity. The source compares cryptographic context fields
to its independent route/root. It does not restate server-owned clamping rules.
An explicit outgoing `operation-message.ts` projection selects only the frozen
public browser protocol fields, including nested context/descriptor; additional
Identity response fields are neither rejected nor implicitly forwarded to a peer.

`shared/crypto/shared-unlock-source` uses the published package to verify all
participant keys/transcript, the Identity key-context commitment, and the MK's
ability to recover the independently held own member private key. Even a
self-consistent substituted descriptor with a new matching digest is rejected
when its recovered key differs from the already unlocked source. Only then does
it seal one encrypted MK for the verified recipient. Temporary key copies are
wiped and DH state disposed after success, failure, cancellation or timeout.
The source's own keys/session remain intact unless a separate local action erased
them. Before delivery the transaction awaits the browser adapter's fresh recipient
verification, rechecks its own full authority, then invokes a synchronous send
callback with only public operation material and the encrypted envelope. No source
token or raw key enters that packet. The result identifies only operation and
exact generations; it does not expose a prepared packet for a later unfenced send.
The source retains its cancellation/timer/session fences through this send. A
failed or lost send is not retried; a new attempt needs a fresh one-shot offer.

Tests use real DH/encryption, recover the recipient's member/Vault key and decrypt
a synthetic Entry primitive; Identity is mocked. They reject substituted scope,
participants, transcript/descriptor and current-root changes, plus pending API
results after lock/logout/expiry/manual/peer/OFF/revision/refresh/cancel. Source
and receiver transactions are now invoked by the pre-release coordinator below.
Closing/expiry barriers, own activity, settings and full browser handoff
acceptance remain open.


## Browser operation transport (implementation increment)

The established Chromium route now supports strict bounded operation frames:
source offer, receiver DH/proof offer, encrypted handoff, ACK and cancellation.
The outer attempt ID is separate from the ACK payload, which still contains only
operation ID and Web/Extension generations. API, handshake nonce, channel ID and
browser document binding must match the live route. Extra fields and oversized
crypto encodings are rejected at this independent browser-input boundary; this
does not add first-party REST response validation or replace SDK crypto binding.

`browser-transfer.ts` composes the existing source/receiver transactions. The
caller must supply independently selected account/org/link/preference/generation
authority to their factories. Each attempt has a 30-second timer plus wall-clock
checks, retires late factory results, and removes subscriptions on completion or
failure. A receiver waits for its real install/rollback to finish; it does not
race storage work against transport cancellation. Lost or incorrect ACK does not
resend the handoff or undo a completed own session. No token is sent to the peer.

Extension verifies the browser's current top-frame document before dispatching
each frame, serializing dispatch with a bounded queue. Web verifies its own
live document. Navigation, peer loss, malformed/mismatched frames or operation
input without a coordinator retire the channel. The extension exposes a
synchronous onReady registration hook. Both configured product bootstraps now
register the pre-release coordinator described below.

Focused tests compose the runner with real source encryption and real receiver
consume/commit/session installation using mock Identity. Negative cases cover
stale attempts, order, substituted browser bindings, expanded payloads, late
factories, wall-clock expiry, lost ACK and waiting for installer rollback. These
are not actual browser Identity/MK handoff or full supported-platform evidence.
The paired native Chromium probe was rerun at 2026-09-11T04:43:10.380Z: all 11
hello/ready/document/bootstrap checks pass on Chromium 153.0.8010.12/macOS arm64
under the actual Web CSP, without accounts or a cryptographic handoff.


## Automatic browser coordinator — pre-release integration

Configured Chromium/Web bootstraps now register the real account/link coordinator
on each browser-confirmed route. Before any crypto offer, clients exchange a
bounded state record containing status, account ID, a fresh state ID, the own
source generation (or a new receiver generation), and source organization. The
receiver must be locked/signed out and either have no account or the same account.
A different signed-in account is never replaced. Two unlocked clients do not
start a reverse handoff just because an earlier handoff completed.

Extension allocates the scoped profile link ID; Web adopts exactly that ID and
acknowledges successful persistence before an Extension source may prepare it.
The source reads fresh Identity preference/link state and activates the selected
link through its own tokens/root. The resulting epoch/preference agreement is
sent before the crypto offer. Receiver expectations combine that explicit
preparation contract with independently selected account/org/generations, the
local link marker and native browser/document identity; they are not extracted
from the operation or encrypted envelope being verified.

One attempt and one link selection can be pending on a route. Async storage
checks are bounded by the attempt cancellation/deadline. Extension dispatch
serializes current-document verification, with at most four waiting operation
frames plus one in flight; overflow/navigation retires the route. This permits
adjacent link-selection/preparation or ACK/state messages without an unbounded
queue. No keys or tokens are put into coordinator state or browser control frames.

The actual receiver transaction now publishes verified own inherited authority
to a local installation callback before its best-effort ACK. Its own key/session
fence survives peer closure and rejects a later own lock/session replacement.
Adoption retains original root sequence, generation and time ceilings, does not
request a fresh password proof, and cannot overwrite a newer explicit OFF.
Source-authority subscriptions trigger readiness after late manual preparation.
Updates caused by the receiver's own installation are deferred until completion
so the coordinator does not cancel its own successful install.

Web persists only nonsensitive scoped link/revision/closing records, using an
origin-wide Web Lock across documents. Missing Web Locks, corrupt bytes, a
conflicting link, a pending closing intent or a disconnect latch prevent use.
A failed local closing write remains blocked until repaired. The Web Identity
adapter adds read/create/activate link and own-activity contract methods; actually
feeding trusted activity into inherited roots is still pending.

**Release gate:** manual lock/logout delivery and reconciliation, durable expiry
barriers and settings/UI are not connected yet. In particular, the coordinator
must not ship until tests prove that a peer with an old root cannot undo a manual
lock/logout or an expired receiver. Runtime integration and successful synthetic
selection tests do not establish that property. No merge/release acceptance is
claimed. Full browser Identity/Entry E2E and the supported artifact matrix remain
required. The actual paired Chromium probe also observes signed-out state sent
and received by both product coordinators and detects local Port disconnects;
it does not supply an account or perform an Identity/MK handoff.


## Explicit manual closing persistence — pre-release increment

The popup's explicit lock/logout commands now pass a manual reason to
SessionManager. Keys are wiped and in-flight session work is cancelled before
waiting for storage; manual logout also removes published memory tokens before
that wait. The worker records closing against existing links for the current
account/API and configured Web origins, even if the peer is closed or the own
client is already locked. Internal security/expiry lock and cleanup do not emit
this manual action. Failed persistence still leaves local keys erased and
returns a failure; it does not claim a durable closing receipt.

Web logoutAndReload records the existing account's pending logout before reload,
using the same origin-wide marker store as the coordinator. It clears own auth
synchronously. A failed marker write prevents reload, and generic auth-failure
clearClientSession does not create shared logout intent. A throwing secondary
cleanup cannot prevent the own auth wipe or the closing record.

The store never creates a link while closing. Logout remains stronger than lock,
disconnect remains a separate latch, and failed writes retain the existing RAM
admission gate until repaired. Receiver-only markers may lack an observed server
revision; revision zero/null preference is a repair hint, not authority for a
mutation. Restart durability is proven only after a successful write.

**Still required before merge:** deliver these intents through own Identity and
the linked peer, reconcile stale CAS receipts and missed actions, and flush old
closings before preparing a fresh manual source authorization. At this increment
pending actions deliberately keep sharing unavailable, including after a new
manual unlock, until that reconciliation is implemented. No peer lock/logout
has been delivered by this increment. Durable expiry barriers, OFF semantics,
activity, settings/UI and the full browser/Identity/Entry matrix remain open.


## Own closing delivery and active-root reconciliation — pre-release increment

Manual Extension lock/logout now delivers the saved intent through its own
captured Identity session before ordinary local logout revocation. Web captures
only its own token fields, clears auth immediately, and delivers before reload.
Network delivery is bounded to two seconds; timeout/conflict leaves the durable
intent pending. A changed own session/environment cancels delivery, and an old
Web logout no longer reloads over a newer login.

The drain reads fresh own preference and link state, then submits the exact
current CAS to the distinct lock/logout/disconnect endpoint. It acknowledges only
the saved intent ID after a receipt. Newer logout decisions and the separate
disconnect latch survive. A fresh authenticated OFF settles manual propagation
without a lock/logout mutation; disconnect remains independent. Missing links,
revoked-link conflicts and failed writes are not silently reset or relinked.
There is no automatic mutation retry after 409.

Both real manual-source compositions drain pending actions before reading the
preference and authorizing a fresh password-derived root. The existing ten-second
proof deadline and own lifecycle checks cover this work. The resulting root's
server sequence therefore follows the completed closing barrier; an inherited
root never performs this manual preparation.

A committed receipt emits only a value-free browser link-invalidated hint.
Active clients independently fetch their own stored link through their own
Identity session and compare its invalidation/logout barriers with the sequence
of their currently installed root. Logout is stronger than lock. Local key wipe
starts before observing the receipt in storage; it invokes ordinary local cleanup
and does not echo another shared mutation. Late responses lose to own account,
token, root/generation and route changes. A peer hint alone never orders a logout.

Repair runs when the route/source becomes available, on an invalidation hint and
every fifteen seconds while the route lives; duplicates are coalesced with at
most one read per second and a two-second pending request deadline. Route teardown
retires subscriptions/timers and leaves a valid own session intact. Best-effort
hint delivery is awaited within the sender's existing deadline before Web reload.

**Remaining release gates:** this monitor requires an in-memory installed own
root. Already-locked/restarted clients, expired own access tokens and independent
multi-document activity/expiry still need completion and focused proofs. Backend
PR #54 supports logout on a revoked link while preserving disconnect and revoking
old linked refresh lineages; client receipt tests retain the local disconnect.
Own input now updates only its own Identity idle authority and durable checkpoint,
with the original absolute/offline ceilings. Full settings/OFF propagation,
disconnect/reconnect UX, canonical browser fixtures and real Identity/Entry E2E on
the entire supported artifact matrix remain required. Synthetic Identity tests
and the paired Chromium channel probe do not close those gates.


## Account preference settings (implementation increment)

The Security page reads and writes the single Identity account preference, with
own-session/account/generation fences, revision CAS and no automatic mutation
retry. The switch works without an installed extension. GET refreshes while the
settings surface is open (15 seconds/focus); complete background cross-client
preference invalidation remains a release gate. The source selection observes
ON/OFF changes without extending its existing authority or deadlines.

The click handler pauses local source and receiver attempts before scheduling the
mutation. A nonsensitive, account/API-scoped pause ID survives restart. Failed or
unconfirmed saves remain paused; only that exact successfully completed own save
can clear the marker. Both successful OFF and ON settle this pending-write marker,
so it never becomes a second persistent account preference. Identity remains
authoritative for the saved choice. A late cancellation restores the denial;
failed storage repair keeps RAM denial without claiming persistence succeeded.

Origin-wide Web Locks serialize pause metadata. Storage events only invalidate
known own scopes and trigger fresh reads. Local OFF/disconnect rejection leaves
the verified browser route available; resuming creates fresh state/attempt IDs.
Late cancelled receiver work cannot install keys. These operations do not lock a
completed own session or extend its limits. Disconnect/reconnect controls, complete
Extension Settings integration and the real browser artifact matrix remain open.
