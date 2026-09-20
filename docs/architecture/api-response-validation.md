# Trusted API response validation inventory

Palladin's authenticated, version-matched API is authoritative for domain state.
Ordinary REST metadata uses TypeScript contracts, not runtime response schemas.
The web client does not restate backend-owned lifecycle, status, revision or
cross-field business invariants, and must not silently filter response rows.

This inventory covers runtime validation of API responses. Form schemas, import
files, browser/DOM messages, third-party responses and decrypted ciphertext are
separate untrusted or cryptographic boundaries and remain validated.

## Decisions

| Area | Runtime validator | Decision and boundary |
|---|---|---|
| Authentication and identity KDF | `features/auth/api/auth-api.ts`, `features/auth/hooks/use-password-login.ts` | Retain the login/TOTP discriminator and the bootstrap-to-authenticated-account checks. These responses select a distinct authentication flow and are compared with the requested KDF profile plus the authenticated account before local key derivation is accepted, so they are an independent authentication and cryptographic boundary rather than display-state validation. |
| Shared-unlock Identity adapter | `features/auth/shared-unlock/api.ts`, `source-authority.ts`, `receiver.ts`, `reconnect-staging.ts` | First-party responses remain typed contracts covered by provider fixtures. Crypto verifies descriptor commitments, derived member key and the full offered/consumed/committed transcript against independently selected account/org/link/browser/document/generations. Before publishing keys, every receiver (including normal/tokenless admission without a reconnect hint) uses its own newly committed JWT to read the selected link: current active epoch and invalidation barrier must still admit that committed generation. Independent authority is this fresh own Identity read plus the preselected local scope; the concrete threat is lock/logout/disconnect after commit or a forged/stale browser reconnect hint. Negative tests retain local revocation and revoke the incomplete issued session on mismatched scope/epoch/barrier, missing auth, timeout or cancellation. The Chromium coordinator is connected; full native acceptance and other platform adapters remain release-gated. |
| Agents | `features/agents/api/agents-api.ts` | Agent metadata and type lists use TypeScript response contracts without runtime schemas. Retain icon-upload coordinate checks only: their URLs and sizes control a browser upload operation. |
| API keys | `features/api-keys/api/api-keys-api.ts` | Keep the supported string/integer transport normalization, preserve unknown string lifecycle values for neutral presentation and expose actions only for known actionable states. An unknown value must never be silently reclassified as revoked or activate a different mutation path. Generated plaintext keys remain a one-time authenticated response handled only by the creation flow. |
| Audit | `features/audit/api/audit-api.ts` | Typed REST pages retain every row and preserve unknown actor/event types; never coerce an unknown actor to System. An explicit structural projection omits legacy presentation names. Authorized local caches resolve names; rendering retains metadata allow-listing. No per-row validation or skip loop remains. |
| Grants | `features/grants/api/{pending-grants,grants,org-grants,grant-summary}-api.ts` | Management, pending and summary responses use TypeScript contracts. No row schema, numeric business bounds, discriminator inference or skip loop remains. Additive Entry/Script scope fields and terminal grants survive unchanged. Decode encrypted reason material separately: an unsupported/corrupt reason becomes unavailable while the grant stays visible and denyable. Approval fails before key use without readable reason material; signature, recipient, authenticated scope and coordinate verification still precede decryption/encryption. Unknown statuses remain neutral, and only explicit supported states/capabilities enable known actions. |
| Notifications and push | `features/notifications/{notifications-api,preferences-api,push-api}.ts` | REST feed, summary, preferences and push-registration responses use typed contracts without row filtering. Unknown categories and non-pending states remain visible in History. Keep value-free metadata sanitization and independently versioned SignalR/browser-push shape decoding. Categories are open strings there too: a future category must not suppress a known event or cache invalidation. Identifiers and occurrence timestamps remain transport/content checks, not REST domain validation. |
| Search | `features/search/search-api.ts` | Administrative REST search uses a TypeScript contract for Agent/Member results. The client does not revalidate backend-owned identifier format, label length or result count. Query text remains transient in the POST body; Vault/Entry search remains client-local. |
| Organization and Team | `features/settings/api/org-api.ts`, `features/teams/api/organization-invitations-api.ts`, `shared/api/organization-{member-directory,members,roles}-api.ts` | Organization settings, member lists, role catalogs and invitation responses use typed contracts. No repeated positive-number, email, role-state or authorization-version validation remains. The historical member directory explicitly projects only userId/displayName for its memory-only cache without discarding rows. |
| Public assets | `shared/api/public-assets-api.ts` | Catalog metadata is a typed REST contract without name/alias/revision/type validators. Retain user-supplied hostname normalization and configured URL namespace/origin checks. Search, by-id and Ensure check each image URL separately: an untrusted destination is omitted without discarding sibling icons or the backend's terminal status. Only the configured immutable asset origin may be rendered or cached. Catalog failure is presentation-only and must not block Entry persistence. Preserve unknown backend-owned acquisition states as nonterminal so a forward-compatible queued state remains pollable; `ready` and `failed` are terminal. |
| Account consent and analytics | `features/privacy/consent-runtime.tsx`, `features/privacy/use-consents.ts`, `shared/lib/analytics-pause.ts` | Consent responses remain TypeScript contracts. Capture uses a fresh authenticated account grant for the client-owned current notice version, bound to the independently captured login generation and freshness deadline. Invalidated/replaced query snapshots cannot authorize capture, even before React effects run. Language and former local activation records do not gate consent. A temporary memory-only form pause prevents capture during draft withdrawal or saving; cancellation restores the saved choice. These checks disable capture, never reject a response or screen. No per-device opt-in or local-storage validator remains. |
| API errors | `shared/api/error-response.ts` and HTTP status handling | Retain exact structured error-key and status matching used to classify retry/conflict/access-denied paths. It never treats arbitrary substrings or exception text as authority and does not validate a successful domain response. |
| Vault members | `features/vaults/api/vault-members-api.ts` | Typed REST page without UUID, page-length or lifecycle response validation. Unknown removal states render neutrally. Backend capability and authorization remain authoritative for mutations. |
| Member Vault sync | `features/vaults/sync/member-sync-api.ts` | Display counts, dates and the default-Vault marker are projected from typed metadata separately from encrypted Vault validation; ordinary metadata cannot reject valid key material. Outer key-epoch/access-context additions are ignored. Retain hard byte/page limits, authenticated access-context-to-JWT checks, route/Vault/principal/member bindings, wrapper equality, descriptor scope, projection revision, key-version and generation bindings. These checks compare ciphertext metadata with independent request, JWT, Vault-summary or decrypted structural authority before keys/plaintext are used. The frozen policy-2 `currentRevision == memberIndexRevision` equality also remains: together with each descriptor-to-projection revision binding it makes MemberIndex + MemberSecret one indivisible current head. EntryKey wrapper `resourceRevision` is deliberately not equated with the Entry head revision. Accept shorter offline leases; reject negative or policy-exceeding leases because the JWT policy is independent authority. Access-context timestamps accept the backend NodaTime Instant UTC representation with up to nine fractional digits; transport precision must not reject an otherwise valid empty-Vault snapshot or closing delta. Lease duration is compared as integer nanoseconds so a negative or policy-exceeding fraction cannot be hidden by millisecond truncation. Unknown optional head fields are stripped instead of rejecting the complete sync page. A decrypt/parse repair carries the exact failed active generation into compare-and-delete; it never performs a fresh lookup that could remove a concurrently activated valid generation. |
| Canonical Entry, history and lifecycle | `features/vaults/api/vault-api.ts` | History actor/date and retention policy are typed metadata separate from envelope validation. Unknown actors remain visible with a shortened ID instead of being relabelled System. Presentation dates do not undergo format checks; import outcome metadata is typed without business-rule validation. Retain envelope scope and descriptor-to-head revision/key/operation bindings before decrypting current or historical secrets. The requested creation-challenge count is independent request authority and remains checked before per-Entry encryption starts. Remove Discovery high-watermark ordering and restore-response state equality: both are backend-owned mutation/lifecycle rules. Lifecycle mutation responses still require a readable current revision, and future optional outer fields are stripped. |
| Discovery provisioning | `features/vaults/api/agent-discovery-api.ts` | Retain public-key, recipient-version and known provisioning-state decoding. This state selects whether the client performs a cryptographic provisioning operation; an unknown state must fail closed instead of being guessed as pending/current. |
| Encrypted assets | `features/vaults/assets/encrypted-asset-api.ts` | Ignore additive outer metadata fields. Retain asset/Vault/Entry identifiers, download URL checks, length, digest and encrypted-container bindings. They are independent network and cryptographic authorities before ciphertext is downloaded or image plaintext is rendered. |
| Vault key rotation | `features/vaults/rotation/rotation-api.ts` | Outer DTOs, pages, recipient records and key-epoch metadata accept additive fields. Progress results use typed metadata and do not repeat backend numeric constraints. Retain bounded rotation sources, fencing token, epoch and source-envelope contracts. These values gate a resumable key transformation and are checked against route/current Vault authority before any rotated key material is prepared or committed. Unknown states fail closed. |

## Review rule

Individual Entry sharing (`shared/crypto/entry-share.ts`) validates decrypted
snapshot JSON and AEAD scope, not backend-owned lifecycle metadata. The requested
share ID is independent link authority; canonical source coordinates come from
the explicit delivery contract. Tampering with any AAD field, a self-consistent
packet for another requested share, extra plaintext properties, malformed byte
encodings and excessive ciphertext fail before plaintext is returned. Errors
discard schema diagnostics to avoid exposing secret values. See
`features/entry-sharing.md`; the HTTP/UI adapters are not implemented yet.

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

## Regression checks

`shared/api/trusted-responses.test.ts` covers terminal grants with unavailable
reason material, forward-compatible notification categories/states, retained
invitation addresses, server-owned seat policy, and unknown audit actors. API
suites assert all rows/cursors survive; approval-review tests assert an invalid
reason never authorizes key use. Existing crypto and browser-boundary negative
tests remain in the full suite. Provider/consumer contract checks belong before
release rather than a runtime reject-or-hide layer in authenticated clients.

Mixed-adapter regressions also cover additive rotation/recipient/epoch/access-context and encrypted-asset metadata, unknown history actors, backend retention/count values, realtime cache invalidation with a future category, and catalog sibling isolation. Existing negative tests still reject recipient-key versions, substituted envelopes, scope/revision mismatches, excessive leases and byte limits, untrusted asset URLs, and ciphertext digest mismatches.
