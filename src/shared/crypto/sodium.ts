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
 * Overwrite sensitive byte buffers with zeros so key material does not
 * linger in memory after we're done with it. libsodium's `memzero`
 * is resistant to compiler dead-store elimination.
 */
export function wipe(arr: Uint8Array): void {
  sodium.memzero(arr)
}
