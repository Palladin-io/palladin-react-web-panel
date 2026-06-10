import { fromBase64, toBase64 } from './encoding'
import { loadSodium, wipe } from './sodium'

/**
 * The encrypted entry content the user already holds (fetched from
 * `GET /vaults/{id}/entries/{eid}`), encrypted under the Vault Key.
 */
export interface SealedEntryContent {
  /** base64 `crypto_secretbox_easy(plaintext, nonce, VK)` (no nonce prefix). */
  encryptedBlob: string
  /** base64 24-byte nonce used for `encryptedBlob`. */
  nonce: string
}

/**
 * The per-entry envelope handed to the backend on grant approval. Byte-for-byte
 * what the agent's MCP client consumes:
 *   1. `DEK = crypto_box_seal_open(agentWrappedDek, agentKeypair)`   (X25519 sealed box)
 *   2. `plaintext = crypto_secretbox_open_easy(reEncryptedBlob, nonce, DEK)` (XSalsa20-Poly1305)
 */
export interface GrantEntryEnvelope {
  reEncryptedBlob: string
  nonce: string
  agentWrappedDek: string
}

export interface ProduceGrantEntryEnvelopeParams {
  /** Entry content sealed under VK (from the entry detail endpoint). */
  entryContent: SealedEntryContent
  /** The unwrapped 32-byte Vault Key (held in memory after unlock). */
  vaultKey: Uint8Array
  /** The agent's X25519 public key (base64), taken from the grant request. */
  agentPublicKey: string
}

/**
 * Produce a GRANULAR grant envelope: decrypt the entry with VK, re-encrypt it
 * under a fresh per-grant DEK, and seal that DEK to the agent's public key.
 *
 * This is the ONLY place the web client performs grant re-encryption — it lives
 * in `shared/crypto/` so the libsodium primitives stay in one audited module
 * (feature hooks/components call this helper, never `crypto_*` directly).
 *
 * Crypto contract (must stay byte-compatible with the MCP agent consumer):
 *   - secretbox: XSalsa20-Poly1305 via `crypto_secretbox_easy` / `_open_easy`,
 *     24-byte nonce shipped as a separate field (NOT prepended to the blob).
 *   - sealed box: X25519 + XSalsa20-Poly1305 via `crypto_box_seal` /
 *     `crypto_box_seal_open` (anonymous sender).
 *
 * The decrypted plaintext and the DEK never leave this function — both are
 * wiped before returning, regardless of success or failure. Nothing here is
 * logged or sent to analytics.
 */
export async function produceGrantEntryEnvelope({
  entryContent,
  vaultKey,
  agentPublicKey,
}: ProduceGrantEntryEnvelopeParams): Promise<GrantEntryEnvelope> {
  const sodium = await loadSodium()

  const cipher = fromBase64(entryContent.encryptedBlob)
  const vkNonce = fromBase64(entryContent.nonce)
  const agentPk = fromBase64(agentPublicKey)

  // 1. Recover the plaintext using the Vault Key.
  const plaintext = sodium.crypto_secretbox_open_easy(cipher, vkNonce, vaultKey)

  // 2. Fresh per-grant DEK.
  const dek = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES)
  // 3. Re-encrypt the plaintext under the DEK with a fresh nonce.
  const newNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

  try {
    const reEncrypted = sodium.crypto_secretbox_easy(plaintext, newNonce, dek)
    // 4. Seal the DEK to the agent's public key (anonymous sealed box).
    const agentWrappedDek = sodium.crypto_box_seal(dek, agentPk)

    return {
      reEncryptedBlob: toBase64(reEncrypted),
      nonce: toBase64(newNonce),
      agentWrappedDek: toBase64(agentWrappedDek),
    }
  } finally {
    // Never let the plaintext or DEK linger in memory.
    wipe(plaintext)
    wipe(dek)
  }
}
