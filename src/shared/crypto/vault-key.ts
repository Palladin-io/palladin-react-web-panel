import { toBase64 } from './encoding'
import { loadSodium, wipe } from './sodium'

/**
 * Generate a fresh 32-byte Vault Key and seal it for the user.
 *
 * The VK is the symmetric key that will encrypt every entry in the new
 * vault. To stay zero-knowledge we never send it to the server in the
 * clear: we derive the user's X25519 public key from their private key
 * (already in memory after unlock) and seal the VK to that pubkey using
 * an anonymous sealed box — only someone holding the matching private
 * key can ever unwrap it. The base64-encoded ciphertext is what the
 * backend stores.
 *
 * The raw VK and the derived public key are wiped from local memory
 * before this function returns; the only surviving artefact is the
 * base64 string that is safe to ship over the wire.
 *
 * Lives in `shared/crypto/` (not in a feature folder) because the
 * audit surface for libsodium primitives must stay in one place —
 * feature code calls this high-level helper rather than reaching for
 * `crypto_box_seal` directly.
 */
export async function sealVaultKey(privateKey: Uint8Array): Promise<string> {
  const sodium = await loadSodium()
  const vk = sodium.randombytes_buf(32)
  const publicKey = sodium.crypto_scalarmult_base(privateKey)
  try {
    const wrappedVK = sodium.crypto_box_seal(vk, publicKey)
    return toBase64(wrappedVK)
  } finally {
    wipe(vk)
    wipe(publicKey)
  }
}
