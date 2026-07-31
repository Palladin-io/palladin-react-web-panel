import { describe, expect, it } from 'vitest'
import {
  decryptPresentationAsset,
  encryptPresentationAsset,
  isEncryptedAssetReference,
  MAXIMUM_ICON_PLAINTEXT_BYTES,
  validatePresentationAsset,
  type EncryptedAssetScope,
} from './vault-v2-assets'

const scope: EncryptedAssetScope = {
  organizationId: '00112233-4455-4677-8899-aabbccddeeff',
  vaultId: '11112233-4455-4677-8899-aabbccddeeff',
  assetId: '22222233-4455-4677-8899-aabbccddeeff',
  target: 1,
  keyVersion: 7,
  memberKeyGeneration: 3,
}
const key = new Uint8Array(32).fill(9)
const png = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, ...new Uint8Array(24))

describe('Vault v2 encrypted presentation assets', () => {
  it('round-trips an opaque image while preserving the authenticated media type', async () => {
    const encrypted = await encryptPresentationAsset(png, 'image/png', scope, key)
    expect(encrypted.ciphertext).not.toContain(png)

    const decrypted = await decryptPresentationAsset(encrypted.ciphertext, scope, key)
    expect(decrypted.mediaType).toBe('image/png')
    expect(decrypted.bytes).toEqual(png)
  })

  it('rejects ciphertext tampering and cross-vault substitution', async () => {
    const encrypted = await encryptPresentationAsset(png, 'image/png', scope, key)
    encrypted.ciphertext[encrypted.ciphertext.length - 1] ^= 1
    await expect(decryptPresentationAsset(encrypted.ciphertext, scope, key)).rejects.toThrow()

    const fresh = await encryptPresentationAsset(png, 'image/png', scope, key)
    await expect(decryptPresentationAsset(fresh.ciphertext, {
      ...scope,
      vaultId: '33332233-4455-4677-8899-aabbccddeeff',
    }, key)).rejects.toThrow()
  })

  it('rejects content/type mismatches and oversized input before encryption', () => {
    expect(() => validatePresentationAsset(png, 'image/jpeg')).toThrow(/media type/i)
    expect(() => validatePresentationAsset(new Uint8Array(MAXIMUM_ICON_PLAINTEXT_BYTES + 1), 'image/png')).toThrow(/size/i)
  })

  it('accepts only canonical asset references', () => {
    expect(isEncryptedAssetReference(`asset:${scope.assetId}`)).toBe(true)
    expect(isEncryptedAssetReference('asset:../../secret')).toBe(false)
    expect(isEncryptedAssetReference('https://tracker.example/icon.png')).toBe(false)
  })
})
