# Individual Entry sharing — CVT-644 (in progress)

## Current-main integration (2026-09-29)

Whole-card snapshots preserve optional `creditCard.cvv` as a concealed field;
saved copies keep it exact and at `never` for Agent access. A missing CVV is not
synthesized, and a concealed-to-text downgrade rejects independently received
plaintext. Mobile implements the same snapshot field contract; coordinated
consumer upgrade is required before release.

Entry detail search preserves both `tab=sharing` and `from=entries`, so direct
Sharing navigation does not discard the global-library back/sidebar context.
Node-only domain-association tests use `*.node-test.mjs` and run during build;
Vitest does not collect them as empty browser suites. Current-main deployment
configuration and extension-bridge fixes are retained, not overwritten.

The approved scope is the independently encrypted snapshot in CVT-644, not
shared-Vault membership or an Agent grant. Backend lifecycle endpoints exist on
the coordinated feature branch. The web sender form and list now call those
endpoints. The public guest receiver now opens and decrypts a snapshot through
the separate recipient API. Already unlocked recipients can explicitly save a
new copy. Explicit in-document auth continuation now preserves the same receipt.
New accounts can explicitly prepare a destination Vault in the save dialog.
For an already received one-use link, the approved web-to-native path is explicit
account save in the same browser session followed by normal encrypted Member sync
after signing in to that account on mobile. Installation alone is not a transfer;
the consumed link is not reopened. Direct native receipt of an unused link is a
separate path. Real cross-client/device acceptance is still pending.

The owner also approved a distinct browser-extension save path (2026-10-01):
when the extension is unlocked, **Save to Palladin** may transfer the already
received snapshot from this tab into extension-worker memory, but saving requires
an explicit confirmation in extension-owned UI. The page's web session is not
unlocked by the extension and its keys are never exported to the page. The worker
must bind the handoff to the browser-authenticated top-frame document, configured
Palladin web/API environment and its own current unlocked session; recheck all
bindings at confirmation and commit. The extension must preserve every supported
snapshot field, including TOTP, notes and custom fields, or reject the entire
save with a generic error. No second recipient delivery, persistent plaintext
queue, or page-DOM confirmation is permitted. The extension handoff and its
extension-owned confirmation are implemented, but the web receiver integration
still requires staging acceptance in a real browser. The extension's canonical
writer preserves `key.url` through the shared crypto contract; unsupported
snapshot fields still reject the whole save rather than producing a partial
copy. The ordinary web-account path remains the fallback before a handoff. Once
the page attempts a handoff, DOM replies cannot authenticate a saved or cancelled
outcome: only extension-owned UI reports completion, and this page does not
re-enable another save path that could create a duplicate.

## Snapshot boundary

`shared/crypto/entry-share-selection.ts` projects the entire supported Entry
from an already authenticated current `MemberSecretV1`. It copies the title,
Entry type and all supported values. It never serializes the source object, original
key material, Agent visibility/grant policy, icon assets, history or Script
references/execution policy. Script source is inert text; sharing it does not
authorize execution or resolve referenced Entries.

Description, notes, TOTP, billing address and all custom fields are included;
there is no field-selection UI. An unsupported field blocks the complete share
rather than silently producing a partial copy. Source Agent policies and refs
remain outside the copy contract.

### Owner-approved creation layout checkpoint (2026-09-21)

The form defaults to anyone with the link, no additional protection, 24 hours,
and a nullable/unlimited receipt budget. Four shared `FormSection` controls start
collapsed, with the selected value at the right; invalid collapsed sections keep
visible feedback. The whole-entry note and opt-in first-receipt switch remain.
The approved form otherwise stays unchanged. The initial equally weighted
Vault → Entry breadcrumb was rejected. The current web preview instead shows
the Entry icon/name as primary identity on the left, with the smaller, muted
Vault icon/name on the right. This balances the empty right side reported by the
owner without restoring equal visual weight or a frame. The owner approved this
placement. Section height/opacity and chevrons animate for 200ms in both directions;
reduced-motion disables the transitions and collapsed controls are inert.
Vault presentation comes
from the existing memory-only Member sync hook, without another detail request.
This checkpoint supersedes older field-selection/default-policy descriptions.

The encrypted JSON schema is `palladin.entry-share.v1`:

```json
{
  "schema": "palladin.entry-share.v1",
  "title": "Example",
  "entryType": "credential",
  "fields": [
    { "id": "credential.password", "label": "", "type": "concealed", "value": "example-only" }
  ]
}
```

Types are `key`, `credential`, `script`, `creditCard`. Field types are `text`,
`multiline`, `concealed`, `totp`; values are strings, with TOTP represented as an
`otpauth://totp/` URI containing the selected seed, never a transient generated code.
Native IDs retain their canonical names, custom IDs retain `custom:` identifiers.
Empty native labels are localized by the receiving UI; custom labels are copied.
Snapshot parsing rejects extra properties, duplicate IDs and empty selection.
The source title is always included and must be visible in the sender preview.
Values are not trimmed or Unicode-normalized by the sharing layer.

## Encryption and independent authority

`shared/crypto/entry-share.ts` uses a fresh random 32-byte key and XChaCha20-Poly1305
with a fresh 24-byte nonce. An independently generated random 32-byte access bearer
authorizes the server route; it cannot decrypt the payload. Optional PIN/password
and OTP remain backend gates, not substitutes for the random encryption key.
Nonce and ciphertext use canonical padded base64 in the existing .NET byte-array
contract. Ciphertext including the 16-byte tag is bounded to 262,144 bytes.

AAD is this exact byte concatenation, with no separators or length prefixes:

| Offset | Bytes | Value |
| --- | --- | --- |
| 0 | 19 | ASCII `PLDN-ENTRY-SHARE-v1` |
| 19 | 16 | Share UUID in RFC/network byte order |
| 35 | 16 | Organization UUID |
| 51 | 16 | Vault UUID |
| 67 | 16 | Entry UUID |
| 83 | 8 | Source revision, unsigned big-endian u64 |
| 91 | 8 | Expiry Unix seconds, unsigned big-endian u64 |
| 99 | 4 | Expiry fractional nanoseconds, unsigned big-endian u32 |

Total: 103 bytes. These offsets correct an earlier documentation counting error;
the implementation and independent fixture have always used this byte layout.

UUID text is canonical lowercase. Revisions use canonical decimal strings, never
JS numbers. UTC expiry accepts zero to nine fractional digits, preserves all
nanoseconds and rejects invalid calendar dates. Equivalent textual Instants
produce identical AAD; no Date truncation may change the authenticated expiry.

On creation, scope comes from the selected authenticated organization/route,
current independently decrypted Entry head, server creation challenge and chosen
expiry. The caller must compare the challenge revision with that selected head
before encryption. On receipt, the separately typed canonical delivery fields
are the backend authority for source coordinates; the requested share ID is an
independent input from the selected link and is compared before key use. Scope is
never reconstructed from the encrypted payload being validated. AEAD binds all
canonical delivery fields and rejects scope substitution.

The fixture `src/shared/crypto/fixtures/entry-share-v1.json` was generated using
Python `uuid`/`struct` and native system libsodium, separately from the TypeScript
encoder. It contains only synthetic public test material. Web verifies its exact
AAD and decrypts its ciphertext. Flutter now consumes the byte-identical fixture
in its native crypto tests; actual cross-client HTTP flow remains a release gate,
not established by primitive interoperability alone.

## Link ingress and lifecycle

Link path: `/share/{canonical-share-uuid}`. Fragment has exactly this order:
`#v=1&key={32-byte-base64url}&access={32-byte-base64url}`. Both encodings are
unpadded canonical base64url. Duplicate/unknown fields, percent-encoding aliases
and unsupported versions fail closed. No secret is in the path or query string.

`main.tsx` captures an incoming link in RAM and removes its fragment, query and
history state **before** dynamically importing App/router/analytics. An invalid
share path is replaced with `/share`. Failure to scrub the address prevents
application startup. Other routes, including auth fragments, remain unchanged.
The capture code sends no request and never consumes a receipt.

Before importing App, `installEntryShareNavigation` also installs capture-phase
popstate/hashchange listeners for native in-document navigation. Incoming sharing
fragments and query noise are scrubbed before browser-history subscribers run.
Raw HashChangeEvent old/new URLs are never forwarded: they can retain secrets
even after the current address has been cleaned. A delayed hashchange following
the already handled popstate does not recapture or destroy the new capability.
The clean replaceState notifies the installed browser history. Unrelated auth
fragments are untouched. A later scrub failure clears ownership and replaces the
application with StartupError; a pending bootstrap cannot render over that error.

Successful capture publishes a value-free RAM generation. The receiver subtree
is keyed by share ID and that generation, so a same-ID replacement disposes the
old session, proof forms, revealed content and save dialog before starting fresh.
The replacement follows the same automatic open/eligible-receipt flow as a fresh
link; protected links still require their proofs. The generation is
not a route parameter and never persists or extends the link lifetime.

Pending buffers are wiped on pagehide (including BFCache entry), explicit disposal
and a 15-minute in-memory continuation timeout. Read also checks expiry so a
suspended timer cannot return an already expired capability. Reload cannot recover
the secret from storage; the receiver UI must tell the user to reopen the original
link. This local timeout does not change the sender's server-owned link expiry.

The mounted receiver owns its session and decoded content. Account changes,
crypto-session changes (including lock/logout), unmount, pagehide and expiry
abort transport and discard content. StrictMode's cleanup/reattach must not wipe
the same mounted capability; ordinary unmount disposes it. A late decryption failure
cannot clear a newer incoming link. Explicit auth continuation transfers ownership
as described below. In-document link replacement is covered by actual-router
tests and a native Chrome hash-navigation check with synthetic API data; native
app handoff remains pending. Never put these buffers,
the full link or plaintext in a query or
mutation cache, redirect, local/session storage, IndexedDB, telemetry or errors.
Crypto validation errors intentionally discard Zod details and secret input.

## Sender surfaces and API lifecycle

Entry Detail has a separate Sharing tab. `sharing/entry-sharing-tab.tsx` queries
only structural link metadata in cursor pages, polls every 30 seconds while
mounted and discards its Query cache on unmount. Delivery counters/timestamps
and client confirmation are separate. Unknown server states remain visible with
a neutral fallback rather than failing the list or guessing a mutation. Revoke
requires a confirmation explaining that downloaded copies cannot be recalled.
The sender list keeps each link in a compact, bounded-width card; receipt detail
expands inside that card, while protection and revocation remain explicit actions.
Account, organization, permission or crypto-session changes close the scoped
surface; a late revoke response cannot toast or refresh another session.

`CreateEntryShareDialog` uses ModalShell/DialogFooter and shared form controls.
It decrypts the saved current MemberSecret on demand and shares the whole supported
Entry, including notes, TOTP and custom fields, with no field selector. Defaults are
anyone with the link, no additional secret, 24-hour expiry, unlimited receipts and
no Inbox notification. Additional password or at least six ASCII PIN digits is
optional. Script source stays inert. Recipient email is delivery
metadata, not part of the secret snapshot. Palladin emails only the OTP; the
sender distributes the full link and any additional secret separately.
The named-recipient form accepts 1–20 distinct comma-separated addresses.
The client creates one independently encrypted link per address, each with its
own receipt count and revocation. Completed links remain copyable in RAM when a
later create fails; retry reuses only the pending recipient's exact request and
never recreates an earlier link. The sender must distribute each link to its
matching address; Palladin does not mail the link.
The one-time result presents Copy, Reveal and native Share as inline icon actions
on the same link field; native Share is offered only when the browser supports it.
The Entry edit footer also exposes Share to the left of Discard and Save Changes.

Password/PIN requires matching confirmation in the sender form. Repeated digit
patterns and monotonic digit sequences are rejected as input-quality feedback,
not claimed to provide offline cryptographic protection. No confirmation field
is sent to the API. Default no-protection creation retains the approved compact
collapsed layout. Store/domain configuration is described in
[App Link associations](../app-link-associations.md); it is not enabled without
approved signing/store configuration.

Creation calls the authoritative challenge before sealing and compares its
revision with the selected current head. A mismatch schedules Member sync repair
and never posts the stale snapshot. Mutations use an explicit allowlisted body;
the decryption key and plaintext cannot be spread into the request. These are
typed first-party API contracts, not duplicated runtime business validators.
The challenge POST sends an empty JSON object: FastEndpoints binds the route
scope but still requires the JSON media type for this request contract. A bare
bodyless fetch returns 415 in the real API; the sender transport regression
requires the explicit JSON request.

The creation operation is component-owned RAM, not a TanStack mutation cache.
An ambiguous create failure retains the exact encrypted request, bearer and key
for an explicit idempotent retry; controls stay disabled so the retry cannot
quietly change its recipient or policy. Cancelling loses that local capability;
the UI warns to revoke any committed link from the list. Successful creation
shows a masked, copyable link once, with a value-free copy toast and without
automatically clearing the explicitly copied URL from the clipboard. It then
drops the snapshot and temporary key buffers. Closing, locking, changing the session or pagehide disposes the operation
and aborts pending transport. JavaScript strings are released, not claimed to be
securely overwritten. Editing the source displays the non-synchronizing-copy
warning and directs the sender to Sharing for revocation.

Active links also expose **Change protection**. The component-owned form calls the
existing owner-authorized protection endpoint to add, replace or remove PIN/password.
The new secret is masked, never enters Query/mutation caches and is discarded on
close or pagehide. Requests abort and late responses are ignored after owner/session
replacement. The backend advances the security version and invalidates older receipt
sessions; changing protection cannot recall an already downloaded copy.

## Public guest receiver

The owner-approved receiver (2026-09-28) uses a centered horizontal
`AppWordmark size="sharing"` matching the extension's system-font lockup.
The scoped `share-reception-card` treatment reuses the landing Founder Program
gradient, without a brand underline, header divider or action divider. Other panel
cards and dialogs retain their palettes. The auth background keeps the dark grain
and uses a centered radial bloom in light mode.
Entry identity, fields and authoritative link policy share one inner frame.
Rows use equal minimum heights and left-aligned label/value rhythm; copy and
reveal remain at the right. Secrets start masked. Notes and Script source open a
separate focus-managed `ModalShell`. Copy uses the shared clipboard helper and
opt-in Sonner feedback with no values in the toast. Receiver copies do not schedule
automatic clipboard clearing; other surfaces retain their defaults.
Expiry is localized approximate time remaining, refreshed once a minute for
presentation only. The server's maximum receipt budget is a limit, never a guessed
remaining counter. The product footer is inside the card, with Discover Palladin
and an animated arrow at the right; Privacy/Terms remain centered below the card.
Reduced-motion and mobile hit targets are supported.

Opening a valid capability starts a recipient session once. A basic anyone-with-link
share without additional protection immediately receives, decrypts and displays
the copy: no Check link or Show entry interaction is required. Named-recipient
email and optional PIN/password proofs remain authoritative gates; delivery starts
only after those gates are satisfied. OTP is never sent automatically.
Unknown mode/protection values cannot enable a guessed delivery path. Receipt
limits therefore count eligible page opens, not a subsequent Show action.
Failures require an explicit retry against the same session; render and effects
never loop automatic delivery retries. Display confirmation follows actual rendering.

Each stage retains explicit actions without a redundant Close button; the main
action uses the approved landing-style brand glow. After receipt, guests get
**Save to Palladin** leading to registration
(whose Sign in link preserves the return); a locked existing account gets **Unlock
to save**, and a verified unlocked account gets **Save to my vault**. Neither saving
nor opening the save dialog is automatic: destination selection remains explicit.
A live authenticated, verified, unlocked web session can be established by the
configured shared-unlock bridge for the same API environment. Merely having an
installed or signed-in extension does not establish that account state.
An independently unlocked extension can instead offer the separate confirmed
extension-save flow above; its presence never makes `canSave` for the web-key
path true by itself.

Guests see the product block in the card footer. Its product link and the muted
Privacy/Terms footer open new tabs without a referrer, share material or account
continuation. Proof, received-content and save flows retain the same shared shell.
`/share/$shareId` remains outside the authenticated layout; `/share` explains an
invalid or missing capability. A missing capability never opens a recipient session.

`recipient-api.ts` uses an independent POST-only transport: no account bearer,
cookies, auth refresh, automatic retry, redirect or referrer. Every body is an
explicit projection; the decryption key is never submitted. HTTP and JSON-decoding
errors discard response/request diagnostics. Session and delivery metadata are
typed first-party contracts, not duplicate runtime business schemas. Delivery's
explicit coordinates and the independently requested share ID feed the existing
AEAD verification before content becomes visible.

`use-share-reception.ts` retains the session only in component-owned RAM. An
ambiguous OTP issuance retries its exact generation before explicit resend can
advance it. An ambiguous delivery retries the same session, enabling the server's
idempotent receipt contract without a second opening. A local session deadline
uses wall and monotonic time and cannot exceed the ingress deadline. Failed or
cancelled verification never satisfies a gate; late responses cannot publish
after ownership changes.

The session's optional presentation fields `shareExpiresAt` and `maximumReceipts`
describe the sender's link policy, not the short `expiresAt` receiver session.
Missing policy metadata stays absent; it never falls back to the local deadline.
The public UI explains that anyone-with-link shares one total receipt limit,
not a remaining-receipt counter. Entry type is shown only from the decrypted
snapshot, never as public session metadata.

The initial `otpRetryAfterSeconds` and successful OTP POST's HTTP 200
`retryAfterSeconds` drive a local countdown. The deadline uses wall and monotonic
time in the same RAM operation, survives explicit account continuation without
reset and is recomputed when that continuation is taken. The mounted UI timer
only updates presentation; the server enforces the share-wide cooldown. New
generations wait, uncertain issuance retries the exact pending generation, and
the residual returned by that retry does not restart a full minute. Verification
of an already issued code remains available during the cooldown. No timer sends
email or opens/receives automatically. Verification, disposal and unmount remove
the UI timer; late responses cannot publish into a replacement operation.

Eligible receipt is automatic after the known gates. Fields start
masked, use shared reveal/copy controls, and render inert text (including Script,
URLs and TOTP seed URIs). React confirms display only after committing the decoded
view. Failed confirmation retains the copy and offers a confirmation-only retry;
it neither repeats delivery nor claims a human read the data. Recipients have no
terminate-link action: revocation belongs to the authorized sender. No remote
recall or external-password change is implied.

## Save an already received copy

An authenticated, email-verified, unlocked recipient with VaultManage can open
`SaveShareCopyDialog` and explicitly choose a destination Vault. The public route
does not depend on an already mounted Member sync provider: it reads the own
authenticated Vault list and decrypts names locally. A corrupt Vault stays visible
as an unavailable shortened identifier and does not hide healthy siblings.

The destination control has explicit existing/new modes. Existing decrypted
Vault names are offered as autocomplete choices; a non-matching typed string
cannot silently create a Vault. Unavailable Vaults remain visible as disabled
shortened identifiers. New mode accepts a name and creates a Vault only after
the recipient presses Save; list errors never create one. Creation uses the
canonical client-side encrypted Vault protocol inside the same abortable,
account/organization/key-generation-scoped operation as the Entry save.
An authoritative empty account uses the one-default-per-account endpoint with
the entered name; accounts with Vaults use the regular Vault-create endpoint.
Ambiguous writes retry the exact encrypted request and reconcile against the
authenticated Vault directory. While that Vault creation is uncertain, the
destination name/mode and dismissal are frozen; the only available action is
retrying the same request. A definite non-ambiguous client rejection releases
that pending attempt. If another tab's default Vault wins the one-default race,
its server-owned default marker releases the pending request without choosing
that Vault for the recipient. Frozen-name retries compare NFC-normalized names.
The returned Vault ID is rechecked
against the authenticated, locally decrypted Vault directory before the Entry
copy is encrypted into it. A confirmed save returns the exact new Entry ID and
navigates to its detail route in the same tab. A failed Vault or Entry write
keeps the already received copy in RAM for a bounded retry; it never spends a
second receipt. Backend authorization remains authoritative.

`entry-share-copy.ts` validates the untrusted snapshot and recipient form, assigns
new custom-field IDs and creates a canonical MemberSecret with the recipient's
standard default Agent visibility policy (discoverable), without inherited source
policies or Script references. Discovery does not itself grant secret delivery. Native secret values are
never silently normalized; values incompatible with canonical storage fail
without secret-bearing diagnostics. Omitted required card fields or Script
interpreter must be completed explicitly. Received values cannot be replaced by
that completion form. The copy title is editable to meet the Entry label limit.
The notice explains that existing destination-Vault members and FULL Agents can
access the saved copy under the destination's standard permissions. Discovery is
enabled by the standard new-Entry policy, not excluded specially for received copies.

`entry-share-copy-encryption.ts` binds target envelopes to the captured own JWT
organization, principal, chosen Vault, server-issued creation Entry ID and current
Vault key epoch. The canonical sealer creates fresh Entry key material and client
projections; temporary VK/VDK buffers are wiped. No source Entry or sharing key is
an input. The normal authenticated creation endpoint receives only ciphertext and
the new Entry's structural delivery policy.

The save hook owns pending work in component RAM, outside query/mutation caches.
An ambiguous create response retains exactly the same encrypted body/Entry ID for
explicit retry, freezing destination and form choices. Closing loses that retry;
the warning asks the user to check the Vault before starting another save. Lock,
account/org/permission changes, pagehide and unmount abort work and prevent late
success from refreshing a replacement session. Saving never calls recipient
delivery again and remains available after sender revocation while the
already decoded local copy still exists.

## Explicit account continuation

After receipt, the guest can choose Save to Palladin to reach registration and
its existing Sign in link. An existing account can choose email verification or
unlock. This explicit action
transfers the idle operation and snapshot into `reception-continuation.ts`, a
single module-RAM owner. The auth URL contains only the canonical share path.
Returning takes the same session, proof state, snapshot and original deadlines;
neither a new delivery nor an already completed display ACK is sent.

The root router guard retains ownership only along the exact share path or a
login/register/unlock/verify-email gate with that one clean redirect. Unrelated
navigation, extra query/fragment material, pagehide, expiry, lock, logout and
account/organization replacement discard it. The first authenticated principal
binds an initially anonymous continuation. Password/Google login use a narrowly
synchronous cleanup marker: only their initial anonymous auth-shell clearing may
retain it. The marker never survives an await or suppresses an ordinary logout.
No key, bearer, session or snapshot enters a query/mutation cache or storage.

The verification gate now checks on focus and every 15 seconds while waiting.
After the account is verified, it refreshes this tab's own claims before marking
ready and returning, fenced by user, refresh lineage, client/crypto generation
and query cancellation. Errors expose only a generic request retry; they do not
force reload or cache a credential-bearing HTTP error. Unlock and verification
redirects preserve the canonical return. A clicked email link in another document
does not transport the sharing capability; the original tab must remain open.

Registration still creates an unverified account without a default Vault. After
verification/unlock, the inline preparation above provides the missing destination
without leaving this RAM flow. Actual HTTP/auth E2E and native handoff remain
required; local client tests do not close those gates.

## Verification and remaining work

Focused tests cover whole-entry projection defaults, excluded source data,
all AAD coordinates, independent requested share binding, tampered key/nonce/
ciphertext, native fixture interoperability, Unicode/whitespace preservation,
payload limits, canonical link parsing and URL/RAM lifecycle.

Sender tests additionally exercise optional PIN and notification,
exact-request retry, source revision repair, authenticated organization binding,
lock/unmount/BFCache cleanup, list/revoke states and late mutation responses.
API projection tests prove accidental key/plaintext properties are not submitted.
Mocked HTTP tests do not establish deployed provider/consumer compatibility.

Receiver tests combine the real crypto fixture with mocked public API slices and
exercise both gates, delivery/OTP/confirmation retries, delayed responses, scope
substitution, clock rollback/suspended timers, pagehide, actual unmount and
StrictMode. Page tests prove eligible receipt is automatic, content is masked and
the ACK is issued after the view exists, with confirmation retry and no recipient
termination action.
Transport tests prove no account auth or hidden retry and generic HTTP/JSON errors.
Recipient-policy/countdown tests cover separate/missing metadata, initial
share-wide cooldown, boundary resend, residual retry, StrictMode account return,
wall-clock rollback with suspended UI timers, late response disposal and EN/PL
presentation. On 2026-09-21 the complete web suite passes **2,503 tests / 316 files**,
with lint, TypeScript and build passing. Synthetic real-component UI was reviewed
at PL dark 320px/390px (no horizontal overflow) and wide EN light; the temporary
viewport override was reset. These checks do not replace real API/device E2E.
The staged-diff Gitleaks 8.30.1 scan passes. The complete staged tree reports
123 findings in 17 test/vector files, all verified unchanged from the preceding
HEAD; the full scan is not green and no allowlist was expanded. Classification
of those existing findings remains a release gate.

Save-copy tests cover fresh independent keys, scope/epoch substitution, omitted
field completion, explicit Vault selection, exact encrypted retry and session
cancellation. Continuation tests additionally cover explicit auth transfer,
StrictMode remount, receipt/ACK counts through save, exact clean navigation,
wrong account/org, async cleanup, expiry and replacement links. Verification-gate
tests cover pending refresh, focus, retry and late results after lifecycle changes.
New-account tests cover explicit Vault preparation, existing-default reconciliation,
lost creation/list responses, unavailable Vaults, concurrent clicks and lifecycle
cancellation. A combined component test uses the real receive/continuation/save
hooks and crypto: one guest receipt survives substituted registration/verification,
fresh Vault creation and an independently decryptable Entry save, with one ACK.
Only API/auth transport is substituted; it is not browser/server E2E.
Web Inbox/audit presentation now includes the first-display notification, direct
source Sharing-tab navigation, eight event types and an explicit external actor.
Feed/badge repair is foreground-only REST polling, not a new push channel. Tests
cover localized copy, metadata projection, routing, notification filtering and
hidden/unmounted polling suppression; see `notifications.md` and `audit.md`.
Completion requires real HTTP contracts, browser/native acceptance, mobile
Inbox/audit parity and the verified test environment. A synthetic visual fixture is
only a design aid, never a delivered user test environment.
