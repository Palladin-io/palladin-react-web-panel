# Key Flows (crypto / zero-knowledge)

This file documents the client-side cryptographic and zero-knowledge flows of the web panel. All of it is implemented in `src/shared/crypto/` (key management, libsodium wrappers) and invoked from feature hooks/dialogs — never inline in components.

**Keep this in sync with `shared/crypto/`.** If the implementation changes (algorithm, key wrapping, payload shape), update the matching flow here. If this doc drifts from the code, the code is authoritative — prune or correct the stale steps. Reviewers should flag changes to `shared/crypto/` that don't update this file.

Key terms: **MK** = master key, **VK** = vault key, **DEK** = per-entry data encryption key. Keys live only in Zustand memory; closing the tab destroys them.

## Unlock Flow
1. User enters master password.
2. Derive MK via Argon2id (salt fetched from `/account`).
3. Decrypt `encrypted_private_key` with MK → `user_private_key`.
4. Store keys in Zustand (memory only).
5. Navigate to dashboard.

## Entry Encryption
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
