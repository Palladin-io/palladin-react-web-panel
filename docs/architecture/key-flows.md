# Key Flows (crypto / zero-knowledge)

This file documents the client-side cryptographic and zero-knowledge flows of the web panel. All of it is implemented in `src/shared/crypto/` (key management, libsodium wrappers) and invoked from feature hooks/dialogs — never inline in components.

**Keep this in sync with `shared/crypto/`.** If the implementation changes (algorithm, key wrapping, payload shape), update the matching flow here. If this doc drifts from the code, the code is authoritative — prune or correct the stale steps. Reviewers should flag changes to `shared/crypto/` that don't update this file.

Key terms: **MK** = master key, **VK** = vault key, **EntryDEK** = per-entry data encryption key, **VDK** = Agent Discovery key. Keys live only in Zustand memory; closing the tab destroys them.

## Identity KDF v2

1. The client holds a user-saved 32-byte Account Secret and the exact UTF-8 master password in memory only. Neither value is sent to the backend or persisted by the web panel.
2. The registered profile `identity-argon2id-account-secret-v2` frames the password, computes an HMAC-SHA-256 prehash keyed by the Account Secret, then runs Argon2id once (`m=32768 KiB`, `t=2`, `p=1`, 32-byte output) with the account's 16-byte KDF salt.
3. HKDF-SHA-256 binds the result to the immutable RFC 4122 AccountId and KDF salt, then derives separate `AuthCredential` and MK domains. Only AuthCredential crosses the network; MK stays in memory and unwraps the member private key.
4. Registration generates the AccountId and Account Secret client-side. Login validates the pre-auth bootstrap and then compares the authenticated account's AccountId, profile, security version and KDF salt before unlocking. Unsupported profiles, parameter changes and downgrade attempts fail closed.
5. A legacy password account unlocks with `identity-argon2id-legacy-v1`, then creates a new Account Secret and sends one idempotent CAS migration containing only AuthCredential and rewrapped ciphertext. An interrupted request retries the exact same migration ID and payload.
6. TOTP does not repeat Argon2: the derived MK and Account Secret remain only in the login hook's in-memory pending state until the challenge succeeds, fails, is replaced or the component unmounts.
7. Password change and recovery use fresh KDF salts and rewrap the private key client-side. Recovery also rotates the Account Secret and recovery mnemonic. All owned raw buffers are wiped in `finally`; Zustand stores independent in-memory copies and excludes MK, private key and Account Secret from persistence.

## Vault protocol 2 primitives

- Versioned envelopes use XChaCha20-Poly1305 with canonical projection-specific TLV AAD. Protocol, suite, tenant, Vault, Entry, revision, key version and member generation are authenticated before plaintext is returned.
- Member projections derive isolated 32-byte keys with HKDF-SHA-256: MemberVaultMetadata from VK, MemberIndex/MemberSecret from EntryDEK and AgentDiscovery from VDK.
- Presentation assets use the same `encrypted-asset` HKDF purpose for both clients: Vault icons derive from VK and Entry icons derive from EntryDEK. The immutable `PLDNV2AS` binary container carries only protocol/key-generation metadata, target IDs, a fresh XChaCha20-Poly1305 nonce and ciphertext. Its AAD binds organization, Vault, asset, optional Entry, media-type enum, key version and Member generation. The API receives only the opaque container plus its SHA-256 digest.
- Asset downloads are bounded by the server-declared ciphertext length, digest-checked before decryption and image-decoded locally for type/dimension validation. Decrypted object URLs are short-lived and revoked on scope change, lock or unmount. Remote favicon/domain enrichment is not part of protocol 2.
- EntryDEK and Vault private-key wrappers use the same authenticated envelope boundary; Member/Agent key packages use X25519 sealed boxes.
- Vault manifests and encrypted reasons use canonical JSON plus domain-separated Ed25519 signatures.
- Unknown protocol/suite values, non-canonical encodings, stale generations, substitution and authentication failures fail closed. Raw plaintext/key buffers are owned by the caller and must be wiped immediately after use.
- Cross-language conformance tests read the canonical root fixture set pinned at root epic commit `b370b56e4f65ecf5350bc4f9203fee6429572955`; expected crypto bytes are not duplicated in this repository.

## Protocol 2 Member sync

1. After unlock, open the authenticated MemberVaultKey package with the in-memory Member private key.
2. Decrypt MemberVaultMetadata with an HKDF key derived from VK.
3. Fetch the bounded Member snapshot. Persist its ciphertext envelopes into a private IndexedDB namespace; do not expose it yet.
4. For every head, decrypt the authenticated EntryKey wrapper with the current VK to obtain the 32-byte EntryDEK, derive the MemberIndex key from EntryDEK, decrypt MemberIndex, and wipe both keys and plaintext buffers.
5. Apply the closing delta to the pending namespace. Only then atomically swap it active and publish the normalized in-memory index.
6. Apply later delta pages and their cursors in one IndexedDB transaction. A retention-floor reset builds another private namespace; tombstones remove entries.
7. Lock, logout, abort, or provider teardown clears every decrypted projection from Zustand. Persistent storage contains ciphertext and structural cursors only.

## Protocol 2 Vault creation

1. Request a short-lived server-owned creation challenge whose opaque Vault ID scopes every envelope in the attempt.
2. In browser memory, generate a fresh VK, VDK, Agent-message private key and manifest-signing seed. Encrypt canonical MemberVaultMetadata under a VK-derived key, seal VK to the authenticated Member's current server-authoritative key version, and wrap VDK plus both private seeds under VK.
3. Submit the complete ciphertext-only bootstrap in one create request. The backend consumes the challenge and persists the usable Vault atomically; no plaintext name, description, icon reference, color or raw key crosses the network.
4. Keep only the ciphertext payload while a response is ambiguous. A retry with the same challenge resends those exact bytes; a changed challenge is reconciled against normal encrypted Vault listing before any new material is generated, preventing duplicate Vaults after a lost success response.
5. Wipe every generated raw key, derived metadata key and plaintext serialization in `finally`. After success, close the dialog and trigger normal Member sync instead of placing plaintext metadata into an optimistic cache or navigating to the legacy detail flow.
6. Active organization Agents are eligible for encrypted Discovery by default. Discovery does not grant secret access; a separate scoped grant remains mandatory.

## Protocol 2 Entry creation

1. Request a short-lived server-owned Entry ID challenge, then open the authenticated Member Vault key and encrypted VDK in browser memory.
2. Build `MemberIndex`, canonical `MemberSecret` and optional `AgentDiscovery` from one draft and one closed Agent Visibility Policy. TOTP source material can only be `onGrantDerived` or `never`; Script source and refs can only be `onGrantRuntime` or `never`.
3. Generate one fresh EntryDEK. Wrap it under VK, derive isolated Member projection keys from EntryDEK and the Discovery projection key from VDK, then encrypt every emitted projection at revision `1` with projection-specific AAD.
4. Submit the challenge ID and ciphertext envelopes in one create request. No label, username, domain, password, Notes, policy or other Entry plaintext crosses the network.
5. If the Vault has active FULL grants, creation fails closed until the client can provide the exact canonical per-grant envelope set in the same transaction; the Entry is never committed partially.
6. Wipe VK, VDK, EntryDEK, derived keys and serialized projection plaintext in `finally`. After success, refresh normal Member sync consumers rather than persisting plaintext optimistically.

## Protocol 2 Entry detail and update

1. Render list presentation only from the already-decrypted in-memory MemberIndex. Fetch the canonical encrypted Entry head for the detail route, but do not open MemberSecret until the Member explicitly reveals or edits the protected fields.
2. On reveal, validate the response's organization, Vault, Entry, revision and key-head bindings, open the authenticated EntryDEK wrapper with VK, derive the isolated MemberSecret key and authenticate/decrypt MemberSecret. Wipe VK, EntryDEK, the derived key and serialized plaintext buffers.
3. Preserve the complete decrypted MemberSecret draft, including Agent Visibility Policy and fields the Details tab does not edit. Build the next projections locally and assign exactly `baseRevision + 1` with operation `Updated`.
4. Always emit the new immutable MemberSecret. Emit MemberIndex and AgentDiscovery only when their canonical plaintext changed; removing Discovery is represented by `agentDiscoveryChanged: true` with no replacement envelope.
5. Submit the optimistic `baseRevision`, changed ciphertext projections and the exact refreshed envelope set for every active covering grant in one backend transaction. Until the scoped-grant refresh flow is available, the Details tab fails before opening keys or writing whenever any covering grant exists; the backend independently enforces the exact set and rolls back the whole update on mismatch.

## Planned Vault key rotation

1. After unlock, independently of transient Member-sync polling state, list pending rotations and claim one server lease with a fencing token. The current Vault generation remains usable throughout preparation.
2. Open the current Member VK package and current VDK/private-key envelopes in memory. Generate missing target VK, VDK, Agent-message and manifest-signing seeds locally, then upload only authenticated pending envelopes. A resumed rotation opens the existing pending seed instead of creating another one.
3. On every lease renewal, verify the rotation plan and decrypt/constant-time compare the server's pending seed with the in-memory target keys. A reset, replacement or stale generation fails closed before another batch is accepted.
4. Read Members, Entry-key wrappers, Discovery projections and eligible Agents through deterministic pages of at most 100 items. Transform and submit one page at a time; renew the lease again after expensive cryptography and before submitting a batch, so neither the browser nor backend must retain the full Vault in memory.
5. Submit the fenced atomic commit only after all required pending material is prepared. A dirty-set conflict triggers at most three complete bounded reconciliation passes; pending data never becomes partially current.
6. Lock, logout, offline, hidden-page/navigation teardown or an abort stops the worker. Returning online/visible schedules one resume after in-flight cleanup rather than running concurrent workers.
7. Every opened/generated VK, VDK, private seed, EntryDEK and plaintext projection is wiped in `finally`. Zustand rotation progress contains only phase, opaque IDs, item count and an allow-listed error code; keys, ciphertext, cursors and plaintext are never persisted there.

## Unlock Flow
1. User enters the master password and, for Identity v2, the Account Secret.
2. Validate the authenticated account KDF state and derive MK through the registered Identity profile.
3. Decrypt `encryptedPrivateKey` with MK → member private key.
4. Store independent copies of MK, private key and Account Secret in Zustand memory only.
5. A legacy account must complete the idempotent client-side migration before leaving unlock; a v2 account navigates directly to the dashboard.

## Legacy Entry Encryption (removed by protocol 2 cutover consumers)
1. Get VK: `user_private_key` → decrypt `wrapped_VK` → VK.
2. Serialize entry as typed JSON (`{ type, ...fields }`).
3. Encrypt with VK via `crypto_secretbox`.
4. Send `{ label, type, encrypted_blob, nonce, url_domain? }` to API.

## Grant Approval — FULL
1. Decrypt VK using the user's private key.
2. Fetch the agent's public key from backend.
3. `agent_wrapped_VK = crypto_box_seal(agent_public_key, VK)`.
4. POST approve with the wrapped key + policy params.

## Grant Approval — GRANULAR
1. Decrypt VK → decrypt entry → plaintext.
2. Generate a random DEK.
3. Re-encrypt plaintext with the DEK.
4. `agent_wrapped_DEK = crypto_box_seal(agent_public_key, DEK)`.
5. POST approve with the wrapped DEK + re-encrypted blob.
