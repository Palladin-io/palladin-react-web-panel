import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('../../../shared/api/client', () => ({ api: apiMock }))

import { downloadEncryptedAsset, uploadEncryptedAsset } from './encrypted-asset-api'

const vaultId = '11112233-4455-4677-8899-aabbccddeeff'
const assetId = '22222233-4455-4677-8899-aabbccddeeff'

async function digest(bytes: Uint8Array): Promise<string> {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

describe('encrypted presentation asset transport', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset().mockResolvedValue(new Response(null, { status: 201 }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('uploads only opaque ciphertext with its digest and structural scope', async () => {
    const ciphertext = Uint8Array.of(1, 2, 3, 4)
    await uploadEncryptedAsset({ vaultId, assetId, target: 1, mediaType: 'image/png', ciphertext })

    expect(apiMock.post).toHaveBeenCalledWith(`api/vaults/${vaultId}/assets`, {
      json: {
        vaultId,
        assetId,
        target: 1,
        entryId: null,
        mediaType: 'image/png',
        ciphertext: 'AQIDBA',
        ciphertextSha256: await digest(ciphertext),
      },
    })
  })

  it('accepts additive transport metadata while authenticating the downloaded bytes', async () => {
    const ciphertext = Uint8Array.of(9, 8, 7)
    apiMock.get.mockReturnValue({ json: vi.fn().mockResolvedValue({
      assetId, target: 1, entryId: null, mediaType: 'image/png', ciphertextLength: ciphertext.length,
      ciphertextSha256: await digest(ciphertext), downloadUrl: 'https://private.example/ciphertext',
      futurePresentationHint: true,
    }) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(ciphertext, { status: 200 })))
    await expect(downloadEncryptedAsset(vaultId, assetId)).resolves.toMatchObject({ ciphertext })
  })

  it('rejects a substituted download before returning ciphertext to crypto', async () => {
    const ciphertext = Uint8Array.of(9, 8, 7)
    apiMock.get.mockReturnValue({ json: vi.fn().mockResolvedValue({
      assetId,
      target: 1,
      entryId: null,
      mediaType: 'image/png',
      ciphertextLength: ciphertext.length,
      ciphertextSha256: encodeBase64Url(new Uint8Array(32)),
      downloadUrl: 'https://private.example/ciphertext',
    }) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(ciphertext, {
      status: 200,
      headers: { 'content-length': String(ciphertext.length) },
    })))

    await expect(downloadEncryptedAsset(vaultId, assetId)).rejects.toThrow('digest mismatch')
  })

  it('rejects a response larger than the authenticated metadata without growing memory', async () => {
    const ciphertext = Uint8Array.of(9, 8, 7, 6)
    apiMock.get.mockReturnValue({ json: vi.fn().mockResolvedValue({
      assetId,
      target: 1,
      entryId: null,
      mediaType: 'image/png',
      ciphertextLength: 3,
      ciphertextSha256: await digest(ciphertext.subarray(0, 3)),
      downloadUrl: 'https://private.example/ciphertext',
    }) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(ciphertext, { status: 200 })))

    await expect(downloadEncryptedAsset(vaultId, assetId)).rejects.toThrow('exceeds declared length')
  })
})
