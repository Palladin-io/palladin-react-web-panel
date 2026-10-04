# Feature: auth

## Dynamic extension connections (2026-10-04, rollout in progress)

The extension owns the user-approved API/panel pair. This panel retains an
independently configured extension distribution ID; it never learns its trusted
peer ID from page messages. The browser channel accepts HTTP/HTTPS URL syntax,
while the extension must enforce the exact pair and explicit HTTP consent.

Security settings display native-channel status separately from the account
shared-unlock preference. Connected means a document-bound browser route exists,
not that an Identity session or MK handoff completed. Missing extension identity,
connection attempts, unavailable peers and unsupported HTTP browser capabilities
have separate PL/EN messages. Remote HTTP currently fails closed when Web Crypto
or Web Locks are absent. Portable crypto, equivalent cross-tab serialization and
consumer uptake of the coordinated crypto/backend changes remain release gates;
this increment does not claim full remote HTTP support.

Client-generated UUIDs use `shared/crypto/random-uuid`: native `randomUUID` on
secure origins, or the browser CSPRNG (`getRandomValues`) with UUID v4 formatting
when HTTP hides that method. No weak random fallback is allowed. This covers
registration, shared-link/pause IDs and ordinary client mutations; portable
hashing/KDF and cross-tab locks are still required for remote HTTP unlock.

**Path:** `src/features/auth/`

## What it does
The entry point to the app. Two ways in:

- **OAuth 2.0** via `@react-oauth/google`'s **implicit token flow** (Google primary, Apple/X stubbed). Google returns an `access_token` in the browser, POSTed to `/api/auth/oauth/google` for the app JWT. Implicit-token flow, not auth-code/PKCE — no backend code-exchange endpoint today; if one lands, switch `useGoogleLogin` to `flow: 'auth-code'`. OAuth accounts are always `emailVerified: true`.
- **Email + password** uses Identity password KDF v1. The browser runs the exact UTF-8 password through the registered Argon2id profile once and domain-separates AuthCredential from MK. AuthCredential is sent to the server; password and MK never are. Unsupported profiles fail closed; there is no legacy fallback.

The shared-unlock receiver additionally supports a verified automatic own-session
installation. Only its successful completion emits `completion-toast.ts` through
the existing root Sonner host (PL/EN, polite, no focus change). No state observer,
remount, manual unlock or wire ACK emits that notification. The transaction's
single-use receive guard prevents duplicate success; a newer own lock/session
suppresses a stale notification. Toast errors cannot undo a completed session.
This does not claim completion of fallback UX or the native acceptance matrix.

Session-token storage: the access token is kept **in memory only** (never persisted); only the refresh token is persisted (localStorage) so a reload can silently restore the session via the ky client's 401→refresh path. Idle + absolute session timeouts (`useSessionTimeout`) wipe the keys and access token on walk-away. Moving the refresh token to an httpOnly cookie is a backend-coordinated follow-up.

## How it's organized
- **`components/login-page`** — step machine (`credentials` → optional `totp`). The v1 handshake validates the bootstrap, derives once before TOTP, and verifies the authenticated account KDF state before unlock.
- **`register/`** — credentials followed by recovery phrase display/confirmation. `use-register` generates a client AccountId, posts only v1 AuthCredential plus wrapped key material, and lands the user unlocked. Route `/register`.
- **`verify-email/`** — `/verify-email?token=` result screen (verifying / verified / expired / invalid) via `use-verify-email`. `VerifyEmailBanner` (soft, server-authoritative on `account.emailVerified === false`) is pinned in the authenticated layout with a throttled resend (`use-resend-verification`, fires `fe:auth:verification-email-resent`). Verification never hard-blocks the app — the backend gates sensitive actions independently.
- **Waitlist Developer benefit** — a celebratory acknowledgement dialog appears while the backend-reported personal benefit is active and stays open until its CTA is used. The authenticated shell presents the active level as Premium (including the sidebar label and avatar border), shows a human-readable end date and removes that presentation at expiry. Exact benefit timestamps remain memory-only; after explicit acknowledgement, `sessionStorage` holds only an opaque hash scoped to the user and exact benefit period, and session cleanup removes it.
- **`security/`** — `SecurityPage` (route `/_authenticated/security`, linked from Settings): change master password (`use-change-master-password` — verify current AuthCredential and rewrap under a fresh-salt MK; recovery phrase untouched) and TOTP 2FA (`use-totp` enroll/confirm/disable; QR via `shared/components/qr-code`, recovery codes shown once).

## Key patterns
- **Landing brand proportions:** login uses `AuthBrandHeader`, shared with unlock, for the responsive shield, wordmark and rotating welcome line. Email-verification gate/result screens use `AuthStepShell showBrand` with the same hero shield and wordmark proportions, without the rotating welcome line. Form behavior and density are independent of these brand dimensions.
- **Auth-surface conventions:** the persisted app theme flows through `.auth-surface` and `--cv-auth-*` tokens; no auth route creates a nested dark scope. `AppWordmark` / `AuthSubmitButton` / `AuthStepShell` (shared) provide the hero chrome. Master-password fields use `FormInput type="password"` (the browser *should* offer to save the account password), unlike vault secrets which use `SecretInput`.
- **Crypto isolation:** every derive/wrap/unwrap happens in a feature hook calling `shared/crypto` helpers; MK and private key land in Zustand memory only, are excluded from `persist.partialize`, and owned temporary buffers are wiped in `finally`.
- **`useAuthStore` (Zustand) is the session source of truth:** JWT, userId, permission bits, `isVaultLocked`, `isOnboarded`, `emailVerified` (never regresses true→false), and the active waitlist Developer start/end window. The benefit window is memory-only and is restored by the next session response, never by persistence. Session mutations write straight to Zustand, not through queries.
- **Login/logout cleanup:** a new password or OAuth login first clears the previous auth state, in-memory keys, TanStack query/mutation caches, decrypted member-sync state, and analytics identity. Logout performs the same cleanup centrally and then hard-reloads `/login`, which also terminates pending browser work. Unlocking an existing session does not run this cleanup.
- **Pre-login transport:** registration, password/KDF bootstrap, TOTP and Google login use an anonymous transport with no bearer, cookies, redirects or retries. A rejected proof returns to the form without refreshing, clearing the client generation or reloading the document; a correct TOTP can retry the same bounded RAM challenge. Authenticated account/security requests retain the session-aware API client and its 401 recovery.
- **Refresh hand-off:** refresh responses are accepted only by the client-session generation that started them, so a delayed response from the previous account cannot restore its tokens after cleanup. The encrypted IndexedDB Vault cache remains user-scoped while the account is locked, but logout and account switching delete every active and staging namespace for the previous profile before the next session starts.
- **Verification/session binding:** consuming an e-mail token mutates the current browser session only when the response `userId` matches it. The verified response applies any active benefit window to memory immediately, then a matching session refreshes so the new plan claim and permissions take effect; generation, user and refresh-token fences reject stale refresh responses. A failed refresh is retried once. If both attempts fail, verification still succeeds but that same fenced client session is cleared before navigation, so the next login obtains current authorization claims instead of presenting Premium with stale permissions.
- **Crypto-session cache namespace:** `cryptoSessionGeneration` is a non-secret, non-persisted counter advanced on every unlock, lock, expiry and logout. Queries containing authenticated Vault/Entry ciphertext include it in their cache key so a new in-memory key session never reuses a crypto envelope fetched by an older session. Raw keys are never query-key material.
- **Deep-link return:** ordinary authenticated destinations retain their internal path, search and hash through login/unlock. Individual Entry sharing is an explicit exception: `shared/lib/auth-redirect` retains only a canonical `/share/{id}` path, removes every query/fragment, and reduces malformed sharing routes to `/share`. No sharing key/bearer may enter an auth redirect. Registration accepts the same validated return; login ↔ registration links and successful registration preserve it. Failed refresh recovery unwraps login/unlock/register/verify-email gates instead of nesting them. External, malformed and auth-loop destinations are rejected. Explicit sharing continuation retains its guest session/snapshot in bounded RAM across these SPA routes; ordinary navigation/lock/logout still disposes it. See `entry-sharing.md` for lifecycle and remaining new-account/native gates.
- **Verification in another tab:** the no-token verification gate checks the account on focus and every 15 seconds while waiting, then refreshes its own current session before returning. Publication is fenced by client/crypto generation, user, refresh lineage and query cancellation. A failed refresh leaves the gate retryable without a document reload; request/token diagnostics are discarded before reaching Query's error cache. The gate and authenticated redirects retain a validated return destination. This does not transfer a sharing capability between documents or create a missing destination Vault.

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

While this verified own manual preparation is pending, a rootless Identity
closing read still refers to the previous authorization. The Web monitor defers
that lock until preparation finishes, then compares the fresh root against the
authoritative link barrier. Logout is never deferred. The gate lives only in
the source-authority instance, ends on cancellation/failure, and checks the
original ten-second wall-clock deadline even when browser timers are delayed.
It cannot authorize a peer transfer, extend a session deadline, or suppress a
lock against an already established own root.

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

The Web dependency is pinned to published `@palladin/crypto` 0.8.0. The local
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

## Safari application channel (implementation increment)

The provider selects Safari's native `browser.runtime.connect` with the exact
optional `VITE_SHARED_UNLOCK_SAFARI_EXTENSION_ID`. Its template is empty; the
value is the decoded bundle ID plus parenthesized Team ID. An explicit unsigned
development ID is supported, but never substituted for a signed identity. User
agent detection only selects an adapter: it supplies no recipient authority.
Missing Safari configuration or native API does not fall back to Chromium.
The existing strict ready/operation checks, independent Identity authority and
document-owned lifecycle apply unchanged. No Safari iframe, DOM relay, remote
script or CSP scheme is introduced.

The Extension has a separate Safari sender/current-document adapter and requires
the browser's normal-profile tab, exact configured Web/API pair, native document
ID and a bounded independent current-frame lookup. Older Safari without that
authority fails closed pending its own implementation and native acceptance.
Unit tests are not proof of Safari Identity/MK/Entry, supported versions or
distribution; those remain release gates.

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
When an own authority notification cancels an active source, the coordinator
advertises a fresh state and negotiates a new attempt even if the account and key
generation remain unchanged. The cancelled selection is never resumed. A fresh
read that reports locked, signed out or unavailable authority cannot start a
handoff; new work still passes the existing Identity, document and key-use fences.
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
settings surface is open (15 seconds/focus); background cross-client preference
repair is connected below. The source selection observes
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
trust presentation and the real browser artifact matrix remain open.

## Background account preference repair

Every verified browser route reads its own Identity preference on connection,
own session/token changes, focus/online/visibility and a fifteen-second interval.
A successful own settings write sends only a strict `preference-invalidated`
hint; its recipient reads with its own JWT. The hint contains no preference value,
account selector or credentials, and observations do not echo it. Reads coalesce
to one in flight plus one pending refresh, with at most one start per second.
Reads and outgoing browser verification have two-second timer and wall-clock
bounds; own account/token/generation, API and document fences reject late results.

Account/API-scoped RAM observations reject older revisions. Observed OFF cancels
both source and receiver attempts and guards admission/final installation. ON
wakes only an already valid source and cannot replace keys, renew limits or clear
a failed-save pause. Own key-generation/account changes clear the observations.
An own Identity 401 forgets only the rejected session's transient observation;
network failure retains known OFF. A future receiver still requires fresh
Identity consume/commit and all local pause/link/expiry barriers. No new token or
key persistence, refresh flow or backend preference authority is introduced.

The monitor can use an own JWT while keys are locked. Settings invalidate their
current account query on an own observation. Production Web store/coordinator
tests verify OFF/ON without key/root/limit replacement and stale-account rejection;
transport tests cover hints, flooding, timeout, no echo and missing own auth.
Already-locked/restarted group closing, independent multi-document activity,
disconnect/reconnect, the remaining unlock surfaces and full native Identity/Entry
E2E across the supported artifact matrix remain release gates.

## Manual Web lock and live session boundary

The sidebar's localized Lock action calls `lockClientSession`. It wipes own
MK/private key synchronously and retains its own login, then persists a scoped
manual lock and delivers it through the existing fresh own preference/link CAS
path. Only this explicit action emits a manual lock; generic security/peer lock
does not echo a shared event. A fresh Identity OFF keeps the action local.
Offline/conflict delivery retains the pending record; failed storage retains
local key wipe and admission denial and reports that shared lock did not finish.
No peer-success toast is inferred from a best-effort delivery.

Closing metadata captures API/origin/extension/account before storage waits.
Delivery is fenced to the original token pair and exact post-lock crypto
generation; even a same-account unlock with unchanged tokens defeats an old
pending response. It never wipes a newer session. Existing closing reconciliation
must settle the pending decision before preparing a later manual sharing root.

`AuthenticatedSessionBoundary` unmounts the authenticated content immediately on
lock, expiry or logout, before waiting for router navigation. It routes to unlock
when an own session/refresh lineage remains and to login otherwise, preserving
the safe internal destination including query and hash. The unlock surface stays
available while locked. This also handles a lock/logout received through the
shared-link monitor; a router guard that runs only on navigation was insufficient.
The boundary does not renew sessions or replace their keys/tokens.

Tests use the real auth store and marker/Identity adapter with synthetic REST,
and keep navigation pending to prove that plaintext-bearing children unmount.
Full native lock propagation, restarted/rootless repair, disconnect/reconnect
and the remaining shared-unlock acceptance matrix remain open.

## Local pairing actions — pre-release Web increment

Product update, 2026-09-15: Security presents only the account-level Shared unlock
switch and a short description, with a vertically centered switch and compact
padding. Local pairing status and Disconnect/Reconnect controls were removed
from the settings UI at the owner's request. Loading and actionable save errors
remain visible when needed. The protocol operations described below remain
implemented and tested independently; they are no longer settings UI actions.

Confirmed disconnect captures the exact own account/API/origin/extension scope,
starts a durable disconnect intent and wipes keys synchronously. It retains the
own login. Its ten-second bounded delivery reads current own Identity and revokes
the saved link even when the account preference is OFF; it never writes that
preference. Missing own JWT or network/CAS failure leaves local revocation pending.
Backend receipt uses the existing link-invalidation path for reachable active
peers. It is not proof of already-locked/restarted peer repair.

Explicit reconnect first flushes pending closing, reads its own current link and
reconnects a revoked link with CAS. An explicit retry may finish the local clear
from an authenticated already-reconnected link without replaying the mutation.
Background reads cannot do this. Clearing requires the exact local disconnect
ID, no newer closing and current own account/token/generation at each storage
boundary. Failure/cancellation restores that ID; failed restoration retains RAM
denial rather than queueing a successful clear for repair. Only successful
storage is evidence of durability. The action captures tokens, not key references.

Reconnect ends in a locked new backend epoch. Web therefore locks its own keys
after clearing its latch; a later manual unlock establishes a root newer than
that barrier. No activation, password proof or account preference is fabricated.

The own action now records a durable explicit reconnect invitation for the peer
monitor below. Extension Settings actions, tokenless/restarted handling and full
native acceptance remain incomplete.

## Explicit reconnect delivery between authenticated peers

The strict private browser vocabulary now has `link-reconnect` and
`link-reconnect-ack`, carrying only opaque account/link IDs and a reconnect
revision. An optional nonsensitive `reconnectRevision` on the existing local
marker records an own successful explicit reconnect that still needs delivery.
Old version-one markers default to no invitation. New disconnect or observed
revocation removes the invitation; failed/cancelled clear never publishes it.

`reconnect-monitor` sends that outbox through the verified browser route on own
lifecycle changes, a local explicit-action notification and fifteen-second
repair. Matching ACK settles only that exact outbox entry. The peer compares
account/link with its independently captured own session and local pairing, then
fetches the link through its own Identity JWT. Only a current non-revoked response,
an invitation newer than its observed revocation, no pending closing, and the
exact captured disconnect ID may clear its latch. A peer observation does not
create another invitation. Late own-session/storage cancellation restores denial.

Work coalesces to one run plus one queued request, at most one start per second,
with a two-second timer and wall-clock deadline for storage, REST and route
verification. Incoming invitation and ACK each occupy at most one RAM slot.
Retries use fresh control nonces, never replay crypto handoffs. Route closure
disposes leases/subscriptions/timers. No key, token, root age or account preference
is copied or changed, and a failed preference-save pause remains intact.

Both production route compositions use their own token-only lifecycle capture;
locked keys with a current own JWT can acknowledge. Tests cover a two-monitor
pair with distinct JWTs, outbox restart/ACK/no echo, old/new disconnect races,
account/link mismatch, no own auth, offline/timeout and cancelled storage. Runtime
composition tests use actual markers and the Web auth store or the worker's own
session boundary with synthetic Identity responses.

**Remaining release gates:** a restarted/tokenless peer cannot use a hint as
Identity authority, so this path waits for its own authentication. Rootless
reconnect/group closing, Extension Settings actions, trust/unlock presentation,
independent multi-document limits and real Identity/MK/Entry E2E on the entire
browser/OS/distributed-artifact matrix remain unfinished. This is not full native
cross-client reconnect acceptance.

## Reconnect after a client restart

A verified `link-reconnect` hint now permits bounded receiver staging even when
that client has no own JWT. The coordinator supplies the local source/receiver
role independently of the frame: only receiver selection may defer a retained
revocation. Sources remain denied. Staging requires the exact scoped stored link,
a known observation, no pending closing, and an invitation newer than any currently
observed revocation. The proposed epoch must not reuse the revoked epoch. Account
mismatch and failed preference-save pause remain hard denials.

The hint does not clear the marker, authorize key publication or renew a root.
The ordinary one-shot consume/crypto-open/commit transaction first obtains the
receiver's own newly issued Identity session. Immediately before publishing keys,
`confirmLocalLink` reads the exact selected link with that own JWT. Its current
active epoch must match the independently selected and committed operation; its
invalidation barrier must precede the own authorization sequence. This catches a
lock/logout/disconnect after commit. Browser revision hints are checked against
that fresh own response. Only then may the exact captured disconnect latch clear.
The existing storage cancellation rollback remains in force, followed by a final
local pending/revocation/epoch read. There is no new reconnect invitation or
account preference write; the existing authenticated monitor later acknowledges
the original invitation.

The extension performs this check inside the install checkpoint, after durable
preparation and before synchronous token/key publication. Web checks after its
expiry checkpoint and before the atomic auth-store install. A failed, timed-out
or cancelled confirmation wipes temporary recovered keys and revokes only the
incomplete new receiver session. A completed own session still survives peer loss.
Normal receivers also recheck local closing immediately before installation.
No existing client token is borrowed or persisted in new metadata.

The staging notice is one route-bound RAM item; duplicates/older same-link hints
do not renew attempts. Its delivery uses the existing monitor's one-start/second
bound. New notice/account or route retirement invalidates pending staging. Own
link confirmation has a two-second timer and wall-clock bound inside the existing
thirty-second receiver attempt. Original unlockedAt, authorization sequence and
idle/absolute/offline/MFA limits remain inherited, never restarted.

Tests cover runtime selection without an own JWT, a real crypto receiver and real
Web store/SessionManager, unpublished keys while own GET waits, own-JWT-only
confirmation, cancellation/revocation cleanup, stale/foreign/pending scope,
newer local closing, current Identity barrier/epoch rejection and storage/timeouts.
Identity responses remain synthetic: full native two-client Identity/MK/Entry E2E
and the complete browser/OS/distributed-artifact matrix remain release gates.
Already-locked/restarted group-closing repair, live trust/unlock presentation and
independent multi-document limits remain separate unfinished requirements.


### Closing repair without a local unlock root

The browser link monitor now also captures an own token-only session while keys
are locked. With a live RAM closing witness it retains the existing own GET-link
comparison. Without that witness it uses `POST /api/account/shared-unlock/session-state`
with the exact own refresh token and locally selected link ID; Identity resolves
that logical session and returns `none`, `lock` or `logout` with nullable link
metadata. Client code does not infer a replacement sequence from durable account
checkpoints or peer frames. This path requires the coordinated Identity API change
in backend PR55.

Replies remain tied to the own account, token pair, generation, document and
route. The existing 2-second timer/wall-clock, 1 start/second coalescing and
15-second repair bound apply. A late reply cannot close a replacement session.
Logout clears an already-locked own login; a lock response does not repeatedly
retire an already-locked generation. Neither action echoes a group mutation.
`none` never unlocks keys or restores source authority. OFF does not erase an
already committed closing barrier.401/network failure invents no peer action;
normal own-session authentication/refresh and pre-key-use repair still need their
full lifecycle acceptance.

Focused tests cover the rootless own POST, already-locked logout, missing bound
link, own token/document changes, cancellation, no own JWT and late timeout.
Production composition tests use the real Web auth store or worker token-lease
boundary; the worker transport test still substitutes SessionManager. They do not
prove real browser restart/MK/Entry behavior. A worker restart can remove access
to its own sealed tokens as well as its keys; without own authentication this
monitor cannot query Identity. The separate newly authenticated receiver and
remaining expired-access/resume/key-use acceptance must retain that boundary.


### Fresh link authority before every receiver installation

Every receiver now performs a bounded fresh link GET using its own newly committed
Identity session before publishing keys, including an ordinary receiver with no
old JWT and no reconnect notice. The response must still match the selected
link/epoch and precede no newer closing barrier relative to the cryptographically
verified own authorization sequence. An explicit reconnect notice is needed only
to clear the exact local disconnect latch; it is not needed to enforce this read.
The local marker is read again after the GET, so a disconnect delivered while
Identity was pending also wins. Existing 2-second and operation deadline fences,
key wipe and cleanup of only the incomplete newly issued session remain in force.

Regression tests fail against the previous normal-receiver path and pass with
this check. Real crypto plus the client's own installation store/SessionManager
prove that a normal receiver keeps keys/tokens unpublished while the own GET is
pending, and rejects a server lock occurring after commit even before the local
invalidation arrives. This is a pre-install freshness check; it does not establish
all later resume/key-use behavior or native browser acceptance.


### Atomic local receiver publication and reactive login routing

After the fresh own Identity link confirmation, the receiver reacquires local
origin-wide locks in the fixed order pause → links → expiry. It rereads durable
denials and the retained deadline while holding those locks through synchronous
RAM key installation, final generation checks and completion. No network request
runs under these locks. A peer document's already committed OFF, Disconnect,
manual closing or retired authorization therefore prevents publication even when
its storage event has not reached the receiving document. Later closing writes
serialize after completion; losing the browser channel cannot undo that completed
own session. Cancellation while waiting still prevents a delayed callback from
publishing keys and revokes only the newly issued receiver session.

`LoginPage` reacts to an authenticated, unlocked store transition and replaces the
login route with its previously validated deep link. Token-only locked state does
not redirect. Pending password/TOTP/OAuth work keeps its own navigation ownership,
so installing manual keys cannot interrupt awaited source preparation; manual
success and reactive navigation share a one-navigation fence.

Regression coverage: `receiver.test.ts` exercises real crypto with five durable
cross-document denials after link confirmation and cancellation while waiting;
`publication-guards.test.ts` covers lock ordering, queued writers, retained idle
ceilings, synchronous own pause and failed reads; `login-page.test.tsx` covers
reactive deep-link navigation and pending manual work.

### Google popup ownership during shared unlock

`useGoogleSignIn` holds a RAM-only manual-admission owner from synchronous client
clearing through asynchronous profile cleanup, the Google popup and the backend
exchange. New shared receivers are denied for that whole interval, not only while
a TanStack mutation is pending. The original client/key generations, a per-request
Google `state` value and a five-minute wall-clock ceiling fence callbacks. The SDK
uses the latest callback ref, so a returned token must match the state of its own
request before an exchange starts. Closing, cancelling, navigating away or a
newer manual attempt prevents an old result from publishing. A lost callback is
bounded by a timer; the wall-clock check also applies if timers were suspended.

`useLogin` checks that captured owner after the OAuth response and publishes only
into a locked, keyless client. The final check, token publication and navigation
have no intervening await. A response superseded by another session is revoked
using only its newly issued refresh token over the anonymous login transport,
without clearing/refreshing the current client or revoking Google account scopes.
A cleanup from an older attempt cannot release a newer popup's admission barrier.
The Google button remains pending for the full popup lifetime; explicit password
login cancels that popup owner before beginning its own flow.

The state/override/response fields and non-OAuth popup errors follow the
[Google token-client reference](https://developers.google.com/identity/oauth2/web/reference/js-reference).
Regression tests cover SDK callback correlation, close/unmount/expiry, profile
cleanup failure, real shared receiver denial, and a late account-B response while
account A holds keys. They exercise the real client state and synthetic provider
responses; they do not claim a live Google account authorization test.

Account consent and analytics activation use the shared [privacy feature](privacy.md),
with a first-entry dialog over the ready authenticated application and a Settings → Privacy surface. Only session-guarded
routes opt in through `staticData.consentSession`; public auth routes, including
`/verify-email?token=…`, cannot start consent reads/session restoration. The token
verification flow retains ownership of its own explicit session refresh.

### Password/TOTP admission and exact inherited expiry

Password submission now acquires a blocking manual-admission owner synchronously
through the hook's mutation adapters, immediately after synchronous client clearing
and before asynchronous profile cleanup. The same owner remains active during KDF,
password verification, the idle TOTP input interval, retryable code failures and
final key/source preparation. Cancellation, unmount, a newer session or attempt,
success/failure and the five-minute deadline release only that attempt. A wall-clock
check also rejects TOTP use when timers were suspended. Login routing observes this
whole-attempt pending state; TanStack request flags alone do not define ownership.
The five-minute ceiling begins at credential submission and is not renewed by TOTP
retries. Profile-cleanup failures cannot start credential work.

Session expiry schedules the earlier of the exact current inherited deadline and
the existing 30-second clock-repair interval. A synchronous auth-store subscription
reschedules on limit changes, including trusted own activity and a new unlocked
generation, without extending absolute/offline ceilings. The expiry path wipes MK,
private key and access token at that deadline; pageshow/visibility checks remain.
Tests cover sub-poll idle/absolute/offline expiry, key-buffer wipe, earlier replacement
limits and trusted idle renewal. Browser timer suspension and all later pre-key-use
paths still require their separately recorded native acceptance; this scheduling
change does not claim to complete that broader matrix.
