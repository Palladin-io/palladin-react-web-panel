# Key Flows (crypto / zero-knowledge)

This file documents the client-side cryptographic and zero-knowledge flows of the web panel. All of it is implemented in `src/shared/crypto/` (key management, libsodium wrappers) and invoked from feature hooks/dialogs — never inline in components.

**Keep this in sync with `shared/crypto/`.** If the implementation changes (algorithm, key wrapping, payload shape), update the matching flow here. If this doc drifts from the code, the code is authoritative — prune or correct the stale steps. Reviewers should flag changes to `shared/crypto/` that don't update this file.

Key terms: **MK** = master key, **VK** = vault key, **EntryDEK** = per-entry data encryption key, **VDK** = Agent Discovery key. Keys live only in Zustand memory; closing the tab destroys them.

## Identity KDF and Secret Key (identity-kdf v2/v3)

1. The client encodes the master password as exact UTF-8 bytes without normalization, prehashing or a terminator. The password is never sent to the backend or persisted by the web panel.
2. Two registry-pinned profiles exist; parameters never come from the server and anything else fails closed before any KDF (`identityProfileVersion`):
   - `identity-argon2id-password-v1` (security version 1, read for migration only): Argon2id over the password, HKDF bound to AccountId.
   - `identity-argon2id-account-secret-v2` (security version 2, every new account): Argon2id over an HMAC of the password keyed by the 32-byte **Secret Key** (Account Secret), then HKDF to `AuthCredential` and MK (`deriveAccountIdentity`).
3. The Secret Key is generated client-side at registration, onboarding, migration and recovery. It is the only key this browser persists, and only through the non-extractable WebCrypto device wrapper (`shared/crypto/secret-key.ts`, IndexedDB `palladin-device`). It never reaches the backend, logs or analytics. Explicit sign-out (`logoutAndReload`) and recovery delete or replace it.
4. Login and unlock load the Secret Key for the bootstrap AccountId. Without it they throw `SecretKeyRequiredError` and show the new-browser step (`SecretKeyRequiredStep`): approve with a signed-in phone (device transfer below) or type/paste the key from the Emergency Kit (`parseSecretKeyInput`, checksum and account bound). An unknown e-mail receives a v2 pseudo-bootstrap, so it reaches the same step and no request reveals whether the account exists.
5. The Member key of a v2 account is an X-Wing key (`generateRecipientKeyPair`, suite `palladin-xwing-v1`); its private seed is wrapped only under MK and the recovery key. The auth store keeps the suite (`memberKeySuiteId`) the authenticated account publishes (`memberPublicKeySuiteId`, absent = legacy) next to the private key; `memberKeyFor(privateKey)` pairs them for every open.
6. TOTP does not repeat Argon2: the derived MK remains only in the login hook's in-memory pending state until the challenge succeeds, fails, is replaced or the component unmounts.
7. Password change keeps the Secret Key and the profile; only the password and KDF salt change. Step-up proofs (TOTP enrollment) derive with the stored Secret Key.

## Emergency Kit

- Built on the client only (`shared/lib/emergency-kit-pdf.ts`): the kit page is drawn on a canvas with the browser's fonts and stored losslessly (Flate RGB) in a one-page PDF written in memory; no new dependency, no network, no cache. The PDF blob goes straight to the browser download and its object URL is revoked.
- Contents follow identity-kdf v3: e-mail, Secret Key display string, Secret Key QR (`palladin-kit:v1:` payload), empty master-password field, sign-in address and date. Never the recovery phrase or the password.
- Onboarding, registration, the security upgrade and recovery gate completion on `EmergencyKitPanel` (download, then acknowledge). Settings › Security re-creates the kit only after the password is verified locally (MK opens the Member key wrap).

## Secret Key device transfer (identity-kdf v3 device pairing 2)

- Recipient (new browser, `recipient-shows-qr`): generate a memory-only X-Wing pairing key, create the anonymous session, show the QR (`palladin-pair:v2:r:` with the transfer UUID's 16 bytes and the key digest) and the SAS, poll `claim` with the poll token until delivery, expiry (300 s) or cancel. The envelope opens only with the session values this browser created; a delivery for another account is rejected and nothing is stored.
- Sender (Settings › Security › Add a phone, `sender-shows-qr`): create the session, show `palladin-pair:v2:s:`, wait for the phone's key, show the SAS computed from this browser's own session values, and seal the Secret Key only after the user approves a matching code. Reject cancels without sending.

## Security upgrade (v1 → v2 in place)

1. A password unlock or login of a security version 1 account derives, while the password is in hand, a full v2 draft: new Secret Key, KDF salt, recovery phrase and X-Wing Member key (`createSecurityUpgradeDraft`). After the v1 MK opens the old X25519 key, that key is wrapped under the v2 MK as the legacy-key record and the draft goes into a memory-only store.
2. `SecurityUpgradeGate` blocks the unlocked app: the new recovery phrase is shown and confirmed first, the Secret Key is stored on this browser, then the atomic `security-upgrade` (CAS, idempotent `migrationId`) commits and the store switches to the v2 MK and X-Wing key. Phrase confirmation and device storage happen before the commit so an interrupted tab never leaves the account without a usable Secret Key or phrase.
3. Every Vault Member envelope still addressed to the legacy key is opened with it and re-wrapped to the new key with identical bindings (`rewrapOwnMemberVaultKey`, CAS on the old recipient key version). A served approver rotates the approver key set to a continuity-signed v2 manifest. When no envelope addresses the legacy key, the legacy record is deleted; then the Emergency Kit closes the flow. No analytics.
4. Resume: a v2 unlock that still sees `legacyMemberKey` decrypts it with the v2 MK and runs steps 3 only. A CAS conflict asks the user to sign in again.

## Vault protocol 2 primitives

- Versioned envelopes use XChaCha20-Poly1305 with canonical projection-specific TLV AAD. Protocol, suite, tenant, Vault, Entry, revision, key version and member generation are authenticated before plaintext is returned.
- Member projections derive isolated 32-byte keys with HKDF-SHA-256: MemberVaultMetadata from VK, MemberIndex/MemberSecret from EntryDEK and AgentDiscovery from VDK.
- Presentation assets use the same `encrypted-asset` HKDF purpose for both clients: Vault icons derive from VK and Entry icons derive from EntryDEK. The immutable `PLDNV2AS` binary container carries only protocol/key-generation metadata, target IDs, a fresh XChaCha20-Poly1305 nonce and ciphertext. Its AAD binds organization, Vault, asset, optional Entry, media-type enum, key version and Member generation. The API receives only the opaque container plus its SHA-256 digest.
- Asset downloads are bounded by the server-declared ciphertext length, digest-checked before decryption and image-decoded locally for type/dimension validation. Decrypted object URLs are short-lived and revoked on scope change, lock or unmount. Remote favicon/domain enrichment is not part of protocol 2.
- EntryDEK and Vault private-key wrappers use the same authenticated envelope boundary. Member/Agent key packages use the algorithm-neutral key wrapper of `@palladin/crypto` (`shared/crypto/key-wrapper.ts`): the suite is taken from the recipient key's authenticated publication, new packages are sealed only with the active suite (`palladin-xwing-v1`), the legacy `palladin-x25519-sealed-box-v1` is read-only, and sealing to a legacy recipient fails with `key-migration-pending` (surfaced in the grant UIs; Discovery skips such Agents until they rotate).
- Vault manifests and encrypted reasons use canonical JSON plus domain-separated Ed25519 signatures.
- Unknown protocol/suite values, non-canonical encodings, stale generations, substitution and authentication failures fail closed. Raw plaintext/key buffers are owned by the caller and must be wiped immediately after use.
- Cross-language conformance tests read the versioned fixture set committed at
  `src/shared/crypto/fixtures/vault-v2`. Its manifest and source revision are
  cryptographically pinned so the tests run identically in every clone.

## Protocol 2 Member sync

1. After unlock, list the authenticated encrypted Vault summaries and open each exact MemberVaultKey package with the in-memory Member private key. Decrypt MemberVaultMetadata with an HKDF key derived from VK.
2. Negotiate Vault protocol `2` plus sync policy `2` on the dedicated current-Entry snapshot/delta routes. Every head must contain the complete current `EntryKey + MemberIndex + MemberSecret`; mixed or partial material is rejected.
3. Validate the response against independent authenticated authority: JWT principal/organization/membership generation/offline policy, route Vault, structural Member, current Member-key and VK versions, recipient version/fingerprint, exact Vault summary wrapper and every current structural Entry head binding.
4. Commit each bounded page's complete ciphertext items, exact Member Vault-key wrapper, finite access context and cursor into one private IndexedDB namespace transaction; do not expose the namespace yet.
5. For every head, decrypt only MemberIndex for list/search presentation. Open EntryDEK from the authenticated wrapper, derive the MemberIndex key, authenticate/decrypt, then wipe EntryDEK and plaintext buffers. MemberSecret remains ciphertext.
6. Apply the closing delta to the pending namespace. Only then atomically swap it active and publish the normalized in-memory index. Later delta pages update complete heads, access context and cursor atomically.
7. A retention/generation/policy reset deletes the affected active generation before staging a replacement. Tombstones remain terminal inside a generation, so a delayed head cannot revive purged material.
8. Lock clears all raw keys and decrypted projections but may retain an unexpired ciphertext generation. `disabled` authorizes local use only while the unlocked generation remains connected and successfully synchronized. Persist the maximum observed wall time and combine it with a process-monotonic observation; exact lease expiry, rollback beyond five minutes, access denial, corruption or authority mismatch deletes the affected generation. Logout deletes every active/staging namespace and access context for the profile.

## Protocol 2 Vault creation

1. Request a short-lived server-owned creation challenge whose opaque Vault ID scopes every envelope in the attempt.
2. In browser memory, generate a fresh VK, VDK, Agent-message private key and manifest-signing seed. Encrypt canonical MemberVaultMetadata under a VK-derived key, seal VK to the authenticated Member's current server-authoritative key version, and wrap VDK plus both private seeds under VK.
3. Submit the complete ciphertext-only bootstrap in one create request. The backend consumes the challenge and persists the usable Vault atomically; no plaintext name, description, icon reference, color or raw key crosses the network.
4. Keep only the ciphertext payload while a response is ambiguous. A retry with the same challenge resends those exact bytes; a changed challenge is reconciled against normal encrypted Vault listing before any new material is generated, preventing duplicate Vaults after a lost success response.
5. Wipe every generated raw key, derived metadata key and plaintext serialization in `finally`. After success, close the dialog and trigger normal Member sync instead of placing plaintext metadata into an optimistic cache.
6. Active organization Agents are eligible for encrypted Discovery by default. Discovery does not grant secret access; a separate scoped grant remains mandatory.

## Protocol 2 Agent approval and Discovery provisioning

1. Agent approval requires an unlocked client. Before activation the client verifies that the in-memory Member private key is present; no key is loaded from persistent browser storage.
2. The backend activates the Agent identity and advances its access epoch. The same UI operation then remains pending while the client reconciles every current Vault.
3. For each Vault, open the Member VK package with the Member private key, then open the VDK, Agent-message private key and manifest-signing private key under VK. Fetch only active Agent public keys and structural provisioning status from the backend.
4. For every pending Agent, seal the current VDK with the suite of its published encryption key and sign a manifest (with `vaultAgentMessageKeySuiteId` when the Vault Agent message key is not legacy) bound to the organization, Vault, Agent identity fingerprints and current key versions. Upload only the sealed VDK envelope and signed public manifest, then wipe every opened Vault key.
5. If activation committed but provisioning fails, report Discovery as pending rather than claiming activation failed. The unlocked background reconciler retries on mount, online/visibility changes and a bounded interval.
6. A current VDK package authorizes encrypted Discovery, not secret delivery. Future discoverable Entry revisions use the same VDK and arrive through snapshot/delta sync without another Member action. A new Vault or key/epoch rotation has new key material and triggers reconciliation again.

## Protocol 2 Entry creation

1. Request a short-lived server-owned Entry ID challenge, then open the authenticated Member Vault key and encrypted VDK in browser memory.
2. Build `MemberIndex`, canonical `MemberSecret` and optional `AgentDiscovery` from one draft and one closed Agent Visibility Policy. TOTP source material can only be `onGrantDerived` or `never`; Script source and refs can only be `onGrantRuntime` or `never`.
3. Generate one fresh EntryDEK. Wrap it under VK, derive isolated Member projection keys from EntryDEK and the Discovery projection key from VDK, then encrypt every emitted projection at revision `1` with projection-specific AAD.
4. Submit the challenge ID and ciphertext envelopes in one create request. No label, username, domain, password, Notes, policy or other Entry plaintext crosses the network.
5. Entry creation does not fan out grant material. Existing FULL grants cover the new Entry through their one Vault-key wrapper; GRANULAR grants remain scoped to their existing exact Entry.
6. Wipe VK, VDK, EntryDEK, derived keys and serialized projection plaintext in `finally`. After success, refresh normal Member sync consumers rather than persisting plaintext optimistically.

## Protocol 2 Entry detail and update

1. Render list/detail presentation only from the already-decrypted in-memory MemberIndex. Row intent, Reveal, Copy and TOTP never fetch a canonical Entry detail.
2. For the selected operation, atomically read the active generation and one Entry from IndexedDB. Validate the independently bound access context, exact lease time, current structural revision/key version and complete head before opening any key.
3. Open the cached exact MemberVaultKey wrapper with the in-memory Member private key, open EntryDEK from the current EntryKey, derive the isolated MemberSecret key and authenticate/decrypt only the selected MemberSecret in shared crypto code. Wipe VK, EntryDEK, the derived key and serialized plaintext buffers; a replaced unlock session cannot publish its result.
4. Preserve the complete decrypted MemberSecret draft, including Agent Visibility Policy and fields the Details tab does not edit. When Save begins, fetch the canonical Entry detail through the mutation path and require its revision/key version to equal the selected local structural head before preparing ciphertext.
5. Build the next projections locally and assign exactly `baseRevision + 1` with operation `Updated`. Always emit the new immutable MemberSecret. Emit MemberIndex and AgentDiscovery only when their canonical plaintext changed; removing Discovery is represented by `agentDiscoveryChanged: true` with no replacement envelope.
6. List active GRANULAR grants for this Entry, authenticate each exact frozen scope and current recipient key context, and build a new per-Entry grant envelope against the new Entry revision. FULL grants require no per-Entry refresh. Policy changes may only narrow the previous durable GRANULAR field scope.
7. Submit the optimistic `baseRevision`, changed ciphertext projections and the complete refreshed GRANULAR envelope set in one backend transaction. A missing GRANULAR grant, stale revision/key context or broadened field scope fails closed and rolls back the whole update. The mutation response is not a local cache commit; normal authoritative sync reconciles it.

## Protocol 2 Entry history and restore

1. Mount the bounded history query only while the History tab is active. Each row carries structural metadata, encrypted MemberSecret and the exact historical Entry-key wrapper; no plaintext or raw key is fetched.
2. Open only the version explicitly selected by the Member. Authenticate its organization/Vault/Entry scope and key version, unwrap that historical EntryDEK with VK, derive the version's MemberSecret key, decrypt locally, then wipe VK, EntryDEK, derived key and serialized plaintext buffers.
3. Drop the selected plaintext immediately on lock or tab unmount. Historical ciphertext may remain only in the in-memory query cache and is never copied to persistent client storage.
4. To restore, decrypt the current head separately and submit the selected historical plaintext as a new draft through the normal update flow. The request remains optimistic against the current revision, creates exactly the next immutable revision and refreshes every active covering GRANULAR grant envelope in the same backend transaction; FULL grants continue through their Vault-key wrapper. It never overwrites an old history row.

## ScriptExecution grant and atomic package refresh

1. Decrypt the selected Script and current same-Vault referenced Entries in browser memory. Validate the required description, typed parameter definitions, unique safe reference environment names and current revisions.
2. Generate one `grantId`, build one manifest and one complete package. Encrypt the payload with a random XChaCha20-Poly1305 package DEK; seal that DEK to the current Agent key (its published suite) with wrapper purpose `6`, binding organization/Vault/Script/grant/Agent, access epoch, key version/fingerprint and `packageRevision`.
3. Submit one `ScriptExecution` grant with `Exec` only. The backend receives opaque ciphertext and structural Entry/revision scopes, never Script source, parameters, env names, selectors or resolved values.
4. On any Script or referenced Entry update, enumerate active grants once. Build the next Entry revision and replacement complete packages for every affected direct Script grant, preserving each `grantId` and increasing only `packageRevision`. Commit the exact set atomically.
5. FULL access needs no direct Script grant or stored Script package. The native runtime opens the current Vault material locally and assembles the same execution contract for one request/use.
6. Wipe package DEKs, VK copies, encoded MemberSecrets and recipient-key copies in `finally`; lock-session changes abort before submission.

## Planned Vault key rotation

1. After unlock, independently of transient Member-sync polling state, list pending rotations and claim one server lease with a fencing token. The current Vault generation remains usable throughout preparation.
2. Open the current Member VK package and current VDK/private-key envelopes in memory. Generate missing target VK, VDK, Agent-message and manifest-signing seeds locally, then upload only authenticated pending envelopes. A resumed rotation opens the existing pending seed instead of creating another one.
3. On every lease renewal, verify the rotation plan and decrypt/constant-time compare the server's pending seed with the in-memory target keys. A reset, replacement or stale generation fails closed before another batch is accepted.
4. Read Members, Entry-key wrappers, Discovery projections and eligible Agents through deterministic pages of at most 100 items. Transform and submit one page at a time; renew the lease again after expensive cryptography and before submitting a batch, so neither the browser nor backend must retain the full Vault in memory.
5. Submit the fenced atomic commit only after all required pending material is prepared. A dirty-set conflict triggers at most three complete bounded reconciliation passes; pending data never becomes partially current.
6. Lock, logout, offline, hidden-page/navigation teardown or an abort stops the worker. Returning online/visible schedules one resume after in-flight cleanup rather than running concurrent workers.
7. Every opened/generated VK, VDK, private seed, EntryDEK and plaintext projection is wiped in `finally`. Zustand rotation progress contains only phase, opaque IDs, item count and an allow-listed error code; keys, ciphertext, cursors and plaintext are never persisted there.

## Agent submission review (contract `agent-submission` v1)

1. After unlock, a `GrantManage` member's client reads the approver key set. Absent → bootstrap key version 1; new approvers without wraps → wrap the unchanged keys and sign the next manifest revision; removed approver or changed Member key → rotate to version+1 with a continuity signature by the previous signing key. `unavailable` is re-bootstrapped only after an explicit choice, without continuity, so Agents must re-trust it.
2. Every change uses a single-use server challenge (issuedAt, next approver-set revision, approver list). New key sets use an X-Wing message key and the successor manifest `palladin.organization-approver-manifest.v2` (`messageKeySuiteId`, same signature transcripts); adding approvers keeps the published key and schema. The client wraps the message key and Ed25519 signing seed per approver with wrapper purposes 8/9 (scope organization+member, recipient = the listed Member key in its published suite whose fingerprint it reproduces), computes the approver-set digest over the listed approvers, self-signs the manifest and checks a rotation with the Agent chain rules before upload. The caller must be one of the recipients. Generated keys are wiped after wrapping.
3. To open the caller's wraps, the client binds them to the JWT organization, the authenticated principal, Identity's current Member key version and the fingerprint derived from the in-memory Member private key, and requires the opened keys to reproduce the self-signed manifest's public keys.
4. To review a submission, the client verifies the closed transport shape and the contract `wireEncoding` (exact schema/versions, lowercase UUIDs, canonical positive u64, positive key versions, canonical unpadded base64url with exact binary lengths), the Agent signature with the Agent directory Ed25519 key, organization and listed Agent, and the caller's own approver key version and fingerprint. It then opens the DEK (purpose 7, parent hash of the identity; a `palladin.agent-entry-submission.v2` submission must name the approver manifest's suite in its signed `approverWrappedDekSuiteId`), decrypts the XChaCha20-Poly1305 payload with the identity AAD and requires the inner identity to equal the outer one. The decrypted payload is untrusted Agent input: its schema, string types, non-empty, well-formed and already-NFC strings, HTTPS credential URL and per-field/plaintext limits are checked before anything is shown or sealed. A manifest of the same key version must keep its signing and message key fingerprints. Manifests are shape-checked (exact fields, instant `issuedAt`, binary lengths) before signature verification, both when opening own wraps and before uploading a change. Approver keys are wiped immediately; plaintext stays in a memory-only query removed on lock.
5. Approve as new: creation challenge plus `sealCanonicalEntry` with the default Agent Visibility Policy. Approve as update: decrypt the exact `expectedEntryRevision`, merge only proposed fields and reuse `prepareCanonicalEntryUpdate` (including GRANULAR/Script refresh). An optional GRANULAR `inject` grant for the submitting Agent is built against the resulting revision. Entry, grant and decision commit in one backend transaction; a moved target fails with a stale conflict.

## Unlock Flow
1. User enters the master password.
2. Validate the authenticated account KDF state; for v2 load the Secret Key from the device wrapper (missing → new-browser step) and derive MK through the registered Identity profile.
3. Decrypt `encryptedPrivateKey` with MK → member private key.
4. Store independent copies of MK, private key and the account's Member key suite in Zustand memory only.
5. A v1 account starts the security upgrade, a v2 account with a legacy-key record resumes it; otherwise navigate to the dashboard. Unsupported KDF profiles fail closed.
6. Shared unlock accepts v1 and v2 key contexts: the suite follows the committed security version and the received private key must reproduce the committed 32-byte or 1216-byte Member public key. The ephemeral X25519 transport is unchanged.

## Protocol 2 Grant Approval — FULL and GRANULAR
1. Resolve the Agent's authoritative encryption public key and its suite, recipient key version, fingerprint and access epoch from the backend, then open the Member's current VK package in browser memory.
2. For GRANULAR, authenticate and decrypt the selected Entry's canonical MemberSecret at the exact head revision, project only fields permitted by its Agent Visibility Policy, encrypt that projection under a fresh GrantDEK, and seal the GrantDEK to the current Agent key. Bind the envelope AAD to organization, Vault, grant, Agent, Entry, methods, delivery policy, exact revisions, key generations, field IDs and key fingerprint.
3. For FULL, seal the complete current 32-byte VK once to that exact Agent key. The canonical `AgentWrappedVaultKey` descriptor binds organization, Vault, grant, Agent, Agent access epoch, recipient key version and fingerprint, VK version, suite and purpose. It contains no per-Entry material.
4. Submit either the one GRANULAR Entry envelope or the one FULL Vault-key wrapper atomically. A stale Agent epoch/key, wrong Vault-key version, mixed grant material or duplicate active FULL access fails closed.
5. Wipe VK, EntryDEK, GrantDEK, Agent-key copies and serialized plaintext bytes in `finally`. The backend stores ciphertext only; a FULL wrapper is opened only inside the native Agent runtime and the plaintext VK does not cross into Node, MCP or the browser extension.
