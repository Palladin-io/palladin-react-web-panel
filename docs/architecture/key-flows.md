# Key Flows (crypto / zero-knowledge)

This file documents the client-side cryptographic and zero-knowledge flows of the web panel. All of it is implemented in `src/shared/crypto/` (key management, libsodium wrappers) and invoked from feature hooks/dialogs — never inline in components.

**Keep this in sync with `shared/crypto/`.** If the implementation changes (algorithm, key wrapping, payload shape), update the matching flow here. If this doc drifts from the code, the code is authoritative — prune or correct the stale steps. Reviewers should flag changes to `shared/crypto/` that don't update this file.

Key terms: **MK** = master key, **VK** = vault key, **EntryDEK** = per-entry data encryption key, **VDK** = Agent Discovery key. Keys live only in Zustand memory; closing the tab destroys them.

## Vault protocol 2 primitives

- Versioned envelopes use XChaCha20-Poly1305 with canonical projection-specific TLV AAD. Protocol, suite, tenant, Vault, Entry, revision, key version and member generation are authenticated before plaintext is returned.
- Member projections derive isolated 32-byte keys with HKDF-SHA-256: MemberVaultMetadata from VK, MemberIndex/MemberSecret from EntryDEK and AgentDiscovery from VDK.
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

## Planned Vault key rotation

1. After unlock, independently of transient Member-sync polling state, list pending rotations and claim one server lease with a fencing token. The current Vault generation remains usable throughout preparation.
2. Open the current Member VK package and current VDK/private-key envelopes in memory. Generate missing target VK, VDK, Agent-message and manifest-signing seeds locally, then upload only authenticated pending envelopes. A resumed rotation opens the existing pending seed instead of creating another one.
3. On every lease renewal, verify the rotation plan and decrypt/constant-time compare the server's pending seed with the in-memory target keys. A reset, replacement or stale generation fails closed before another batch is accepted.
4. Read Members, Entry-key wrappers, Discovery projections and eligible Agents through deterministic pages of at most 100 items. Transform and submit one page at a time; renew the lease again after expensive cryptography and before submitting a batch, so neither the browser nor backend must retain the full Vault in memory.
5. Submit the fenced atomic commit only after all required pending material is prepared. A dirty-set conflict triggers at most three complete bounded reconciliation passes; pending data never becomes partially current.
6. Lock, logout, offline, hidden-page/navigation teardown or an abort stops the worker. Returning online/visible schedules one resume after in-flight cleanup rather than running concurrent workers.
7. Every opened/generated VK, VDK, private seed, EntryDEK and plaintext projection is wiped in `finally`. Zustand rotation progress contains only phase, opaque IDs, item count and an allow-listed error code; keys, ciphertext, cursors and plaintext are never persisted there.

## Unlock Flow
1. User enters master password.
2. Derive MK via Argon2id (salt fetched from `/account`).
3. Decrypt `encrypted_private_key` with MK → `user_private_key`.
4. Store keys in Zustand (memory only).
5. Navigate to dashboard.

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
