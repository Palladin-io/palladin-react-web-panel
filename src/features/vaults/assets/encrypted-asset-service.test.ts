import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptAndUploadPresentationAsset, validatePresentationAssetFile } from './encrypted-asset-service'
const mocks = vi.hoisted(() => ({ dimensions: vi.fn(), encrypt: vi.fn(), upload: vi.fn() }))
vi.mock('../../../shared/crypto/vault-v2-assets', () => ({
  MAXIMUM_ICON_PLAINTEXT_BYTES: 2 * 1024 * 1024,
  validatePresentationAssetDimensions: mocks.dimensions,
  encryptPresentationAsset: mocks.encrypt,
}))
vi.mock('./encrypted-asset-api', () => ({ uploadEncryptedAsset: mocks.upload }))
describe('custom icon preparation', () => {
  beforeEach(() => vi.clearAllMocks())
  it.each([
    new File(['svg'], 'icon.svg', { type: 'image/svg+xml' }),
    new File([], 'empty.png', { type: 'image/png' }),
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
  ])('rejects unsupported or out-of-bounds files before decoding or upload', async (file) => {
    await expect(validatePresentationAssetFile(file)).rejects.toThrow()
    expect(mocks.dimensions).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it('uploads ciphertext and returns the canonical icon reference while wiping plaintext', async () => {
    const file = new File(['image'], 'icon.png', { type: 'image/png' })
    const plaintext = Uint8Array.of(1, 2, 3)
    Object.defineProperty(file, 'arrayBuffer', { value: async () => plaintext.buffer })
    const ciphertext = Uint8Array.of(4, 5, 6)
    mocks.encrypt.mockResolvedValue({ ciphertext })
    const assetId = '33332233-4455-4677-8899-aabbccddeeff'
    const scope = { assetId, organizationId: 'org', vaultId: 'vault', target: 1 as const, keyVersion: 1, memberKeyGeneration: 1 }
    const result = await encryptAndUploadPresentationAsset({ file, scope, baseKey: new Uint8Array(32) })
    expect(result).toEqual({ assetId, iconReference: `vault-asset:${assetId}` })
    expect(mocks.upload).toHaveBeenCalledWith({ vaultId: 'vault', assetId, target: 1, mediaType: 'image/png', ciphertext })
    expect(plaintext).toEqual(new Uint8Array(3))
  })
})
