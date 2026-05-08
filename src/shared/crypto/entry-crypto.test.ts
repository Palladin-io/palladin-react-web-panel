import { describe, expect, it } from 'vitest'
import type { EntryPlaintext } from '../../features/vaults/types'
import { decryptEntry, encryptEntry } from './entry-crypto'
import { loadSodium, randomBytes } from './sodium'

describe('entry-crypto', () => {
  it('round-trips a KEY payload through encrypt + decrypt', async () => {
    const vk = await randomBytes(32)
    const plaintext: EntryPlaintext = {
      type: 'KEY',
      value: 'sk_live_super_secret',
      notes: 'Used by the deploy bot',
    }

    const { encryptedBlob, nonce } = await encryptEntry(plaintext, vk)
    const recovered = await decryptEntry(encryptedBlob, nonce, vk)

    expect(recovered).toEqual(plaintext)
  })

  it('round-trips a CREDENTIAL payload through encrypt + decrypt', async () => {
    const vk = await randomBytes(32)
    const plaintext: EntryPlaintext = {
      type: 'CREDENTIAL',
      username: 'user@example.com',
      password: 'P@ssw0rd!',
      url: 'https://example.com/login',
    }

    const { encryptedBlob, nonce } = await encryptEntry(plaintext, vk)
    const recovered = await decryptEntry(encryptedBlob, nonce, vk)

    expect(recovered).toEqual(plaintext)
  })

  it('produces a fresh nonce per call so the same plaintext never collides', async () => {
    const vk = await randomBytes(32)
    const plaintext: EntryPlaintext = { type: 'KEY', value: 'static' }

    const a = await encryptEntry(plaintext, vk)
    const b = await encryptEntry(plaintext, vk)

    expect(a.nonce).not.toBe(b.nonce)
    expect(a.encryptedBlob).not.toBe(b.encryptedBlob)
  })

  it('throws when decrypted with the wrong vault key', async () => {
    const vk = await randomBytes(32)
    const wrongVk = await randomBytes(32)
    const { encryptedBlob, nonce } = await encryptEntry(
      { type: 'KEY', value: 'secret' },
      vk,
    )

    await expect(decryptEntry(encryptedBlob, nonce, wrongVk)).rejects.toThrow()
    // Sanity: calling loadSodium once primes the WASM init for the rejection above.
    await loadSodium()
  })
})
