# Trusted API response validation inventory

Palladin's authenticated, version-matched API is authoritative for domain state.
The web client may decode the transport shape it needs, but it does not restate
backend-owned lifecycle, status, revision or cross-field business invariants.

This inventory covers runtime validation of API responses. Form schemas, import
files, browser/DOM messages, third-party responses and decrypted ciphertext are
separate untrusted or cryptographic boundaries and remain validated.

## Decisions

| Area | Runtime validator | Decision and boundary |
|---|---|---|
| Authentication and identity KDF | `features/auth/api/auth-api.ts`, `features/auth/hooks/use-password-login.ts` | Retain the login/TOTP discriminator and the bootstrap-to-authenticated-account checks. These responses select a distinct authentication flow and are compared with the requested KDF profile plus the authenticated account before local key derivation is accepted, so they are an independent authentication and cryptographic boundary rather than display-state validation. |
| Shared-unlock Identity adapter | `features/auth/shared-unlock/api.ts`, `source-authority.ts` | Preference/authorization/operation/commit responses are typed contracts, covered by copied provider fixtures; no duplicated lifecycle/revision validation. The outgoing proof is bound to the independently captured own account/session, configured API environment and current local key generation/deadlines. Cancellation and environment changes reject late transport results. The key recovery helper separately verifies Identity descriptor commitments, the independently selected account and derived member public key. `shared-unlock/receiver.ts` compares operation fields with the independently captured browser/account/org/link/document route, and `shared/crypto/shared-unlock-receiver` verifies the full transcript/participant/proof bindings across offered, own consumed and committed context. Focused tests reject substituted scope, keys, envelope and commit plus late results. The Chromium native hello/ready adapter now independently selects the exact configured extension ID and checks its route/correlation; it is not yet connected to this receiver transaction. Other platform adapters remain pending. |
| Agents | `features/agents/api/agents-api.ts` | Retain readable string lists and icon-upload coordinates. Agent lifecycle responses are TypeScript contracts and are not rejected by a duplicated lifecycle validator. Upload coordinates are consumed by a browser upload operation, so malformed URLs, identifiers or sizes must not reach that operation. |
| API keys | `features/api-keys/api/api-keys-api.ts` | Keep the supported string/integer transport normalization, preserve unknown string lifecycle values for neutral presentation and expose actions only for known actionable states. An unknown value must never be silently reclassified as revoked or activate a different mutation path. Generated plaintext keys remain a one-time authenticated response handled only by the creation flow. |
| Audit | `features/audit/api/audit-api.ts` | Retain transport-only, per-row decoding and metadata allow-listing. Unknown event types use neutral presentation and one unreadable row cannot collapse the page. The allow-list prevents server-supplied presentation names or unexpected metadata from becoming UI content. |
| Grants | `features/grants/api/{pending-grants,grants,org-grants,grant-summary}-api.ts` | Retain readable per-row decoding and authoritative `type` discriminators. Pending rows accept backend-owned lifecycle values without cross-field rules. Unknown organization-grant statuses use neutral presentation and are not inferred to be terminal; only the explicit known terminal set may show terminal lifecycle guidance. Encrypted reasons, key versions, Agent fingerprints and envelope coordinates remain a cryptographic boundary before reason plaintext or grant keys are used. List rows are isolated so one unreadable item does not collapse an unrelated list. |
| Notifications and push | `features/notifications/{notifications-api,preferences-api,push-api}.ts` | Retain transport decoding and notification metadata sanitization. Unknown notification types remain renderable; unreadable rows are isolated. Categories/channels are client routing discriminators, not a reimplementation of the backend's action lifecycle. |
| Search | `features/search/search-api.ts` | Retain the small bounded result shape. Its discriminator controls which authorized local presentation resolver is used; no backend lifecycle relationship is checked. Unknown fields are stripped so an additive response field does not collapse global search. |
| Organization and Team | `features/settings/api/org-api.ts`, `features/teams/api/organization-invitations-api.ts`, `shared/api/organization-{member-directory,members,roles}-api.ts` | Retain readable transport shapes used by forms and permission presentation. No cross-field lifecycle rule is enforced client-side. Missing optional display values must be handled by the consuming view instead of invalidating an unrelated list. The shared historical-attribution directory strips e-mail or role-heavy additions and retains only its minimal identity projection; it does not reject the entire directory because an unused field was added. |
| Public assets | `shared/api/public-assets-api.ts` | Retain URL namespace, hostname and bounded asset-shape validation. This is an independent browser/network boundary: only the configured immutable asset origin may be rendered or cached. Catalog failure is presentation-only and must not block Entry persistence. Preserve unknown backend-owned acquisition states as nonterminal so a forward-compatible queued state remains pollable; only the explicit `failed` state is terminal. |
| API errors | `shared/api/error-response.ts` and HTTP status handling | Retain exact structured error-key and status matching used to classify retry/conflict/access-denied paths. It never treats arbitrary substrings or exception text as authority and does not validate a successful domain response. |
| Vault members | `features/vaults/api/vault-members-api.ts` | Retain bounded page and structural identity decoding. Server-owned removal state is presentation data; unknown states render neutrally without invented removal or rotation guidance. Actions continue to use backend capability/authorization rather than treating a client status check as a security boundary. |
| Member Vault sync | `features/vaults/sync/member-sync-api.ts` | Retain hard byte/page limits, authenticated access-context-to-JWT checks, route/Vault/principal/member bindings, wrapper equality, descriptor scope, projection revision, key-version and generation bindings. These checks compare ciphertext metadata with independent request, JWT, Vault-summary or decrypted structural authority before keys/plaintext are used. The frozen policy-2 `currentRevision == memberIndexRevision` equality also remains: together with each descriptor-to-projection revision binding it makes MemberIndex + MemberSecret one indivisible current head. EntryKey wrapper `resourceRevision` is deliberately not equated with the Entry head revision. Accept shorter offline leases; reject negative or policy-exceeding leases because the JWT policy is independent authority. Access-context timestamps accept the backend NodaTime Instant UTC representation with up to nine fractional digits; transport precision must not reject an otherwise valid empty-Vault snapshot or closing delta. Lease duration is compared as integer nanoseconds so a negative or policy-exceeding fraction cannot be hidden by millisecond truncation. Unknown optional head fields are stripped instead of rejecting the complete sync page. A decrypt/parse repair carries the exact failed active generation into compare-and-delete; it never performs a fresh lookup that could remove a concurrently activated valid generation. |
| Canonical Entry, history and lifecycle | `features/vaults/api/vault-api.ts` | Retain envelope scope and descriptor-to-head revision/key/operation bindings before decrypting current or historical secrets. The requested creation-challenge count is independent request authority and remains checked before per-Entry encryption starts. Remove Discovery high-watermark ordering and restore-response state equality: both are backend-owned mutation/lifecycle rules. Lifecycle mutation responses still require a readable current revision, and future optional outer fields are stripped. |
| Discovery provisioning | `features/vaults/api/agent-discovery-api.ts` | Retain public-key, recipient-version and known provisioning-state decoding. This state selects whether the client performs a cryptographic provisioning operation; an unknown state must fail closed instead of being guessed as pending/current. |
| Encrypted assets | `features/vaults/assets/encrypted-asset-api.ts` | Retain asset/Vault/Entry identifiers, configured download origin, length, digest and encrypted-container bindings. They are independent network and cryptographic authorities before ciphertext is downloaded or image plaintext is rendered. |
| Vault key rotation | `features/vaults/rotation/rotation-api.ts` | Retain the complete bounded rotation state, fencing token, epoch and source-envelope contracts. These values gate a resumable key transformation and are checked against route/current Vault authority before any rotated key material is prepared or committed. Unknown states fail closed. |

## Review rule

Every retained cross-field check must identify an authority outside the value it
validates: authenticated request/JWT claims, route coordinates, the current
Vault summary, the decrypted structural head, a configured external origin or
a cryptographically authenticated descriptor. Equality between two ordinary
server-owned response fields is not an independent check and must be enforced
by backend tests/contracts instead.


The separate browser-message boundary in `features/auth/shared-unlock/browser-channel.ts`
uses a strict Zod ready schema plus own configured API/origin/extension ID and
locally generated nonce checks. This validates an independently versioned browser
transport, not an authenticated first-party REST response. Recipient identity
comes from the actual native `runtime.connect(configuredId)` call, not a field in
the received object. Negative tests cover substitution, extra fields, stale routes,
expiry of the handshake and document lifecycle. No new REST response validator is added.

The Web source transaction binds the operation's cryptographic scope to its
independently captured route and current own root/key generation. The crypto
helper additionally recovers Identity's descriptor with a temporary MK copy and
compares that private key to the independently held own member key. Focused tests
reject a self-consistent substituted descriptor/digest and changes in the current
root's account, organization and key revisions. This is cryptographic key-use
authority, not another implementation of Identity's response business rules.
`operation-message.ts` is an outgoing browser-protocol projection: it copies only
known public fields, silently omitting unrelated REST additions instead of
validating/rejecting those responses or forwarding them to a peer.
