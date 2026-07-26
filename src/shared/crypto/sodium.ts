import sodium from 'libsodium-wrappers'

let readyPromise: Promise<typeof sodium> | null = null

/**
 * libsodium ships as WASM and must be awaited before use. We lazy-load it
 * on the first call and cache the promise so subsequent callers reuse the
 * same initialisation.
 */
export function loadSodium(): Promise<typeof sodium> {
  if (!readyPromise) {
    readyPromise = sodium.ready.then(() => sodium)
  }
  return readyPromise
}

export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export async function generateKeyPair(): Promise<KeyPair> {
  const s = await loadSodium()
  const kp = s.crypto_box_keypair()
  return { publicKey: kp.publicKey, privateKey: kp.privateKey }
}

/**
 * Encrypt with XSalsa20-Poly1305 and prepend the nonce so callers only
 * need to store a single byte blob. The companion decrypt routine
 * (used during unlock) is expected to split on the first 24 bytes.
 */
export async function encryptWithKey(
  plaintext: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  const s = await loadSodium()
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
  const cipher = s.crypto_secretbox_easy(plaintext, nonce, key)

  const combined = new Uint8Array(nonce.length + cipher.length)
  combined.set(nonce, 0)
  combined.set(cipher, nonce.length)
  return combined
}

export async function randomBytes(length: number): Promise<Uint8Array> {
  const s = await loadSodium()
  return s.randombytes_buf(length)
}

/**
 * Decrypt a blob produced by `encryptWithKey` (nonce prepended).
 * Throws if the MAC check fails — callers should translate into a
 * typed error (e.g. `IncorrectMasterPasswordError`).
 */
export async function decryptWithKey(
  combined: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  const s = await loadSodium()
  const nonceLen = s.crypto_secretbox_NONCEBYTES
  const nonce = combined.slice(0, nonceLen)
  const cipher = combined.slice(nonceLen)
  return s.crypto_secretbox_open_easy(cipher, nonce, key)
}

/**
 * Overwrite sensitive byte buffers with zeros so key material does not
 * linger in memory after we're done with it. libsodium's `memzero`
 * is resistant to compiler dead-store elimination.
 */
export function wipe(arr: Uint8Array): void {
  try {
    sodium.memzero(arr)
  } catch {
    // Vitest/jsdom may hand us a Uint8Array from a different JS realm, which
    // libsodium rejects by constructor identity even though it is writable.
    // Overwrite it directly rather than allowing cleanup to leave a secret.
    arr.fill(0)
  }
}
