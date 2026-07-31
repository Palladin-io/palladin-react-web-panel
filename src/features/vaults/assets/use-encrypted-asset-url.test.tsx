import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EncryptedAssetScope } from '../../../shared/crypto/vault-v2-assets'
import { useEncryptedAssetUrl } from './use-encrypted-asset-url'

const downloadMock = vi.hoisted(() => vi.fn())
const decryptMock = vi.hoisted(() => vi.fn())
const dimensionsMock = vi.hoisted(() => vi.fn())
vi.mock('./encrypted-asset-api', () => ({ downloadEncryptedAsset: downloadMock }))
vi.mock('../../../shared/crypto/vault-v2-assets', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/vault-v2-assets')>(),
  decryptPresentationAsset: decryptMock,
  validatePresentationAssetDimensions: dimensionsMock,
}))

const scope: EncryptedAssetScope = {
  organizationId: '00112233-4455-4677-8899-aabbccddeeff',
  vaultId: '11112233-4455-4677-8899-aabbccddeeff',
  assetId: '22222233-4455-4677-8899-aabbccddeeff',
  target: 1,
  keyVersion: 1,
  memberKeyGeneration: 1,
}

describe('useEncryptedAssetUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    dimensionsMock.mockReset()
    dimensionsMock.mockResolvedValue(undefined)
  })

  it('revokes decrypted object URLs on unmount', async () => {
    downloadMock.mockResolvedValue({ ciphertext: new Uint8Array([1]), mediaType: 'image/png', target: 1 })
    decryptMock.mockResolvedValue({ bytes: new Uint8Array([1, 2]), mediaType: 'image/png' })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:encrypted-icon')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const { result, unmount } = renderHook(() => useEncryptedAssetUrl(scope, new Uint8Array(32).fill(4)))
    await waitFor(() => expect(result.current.url).toBe('blob:encrypted-icon'))
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:encrypted-icon')
  })

  it('reports corrupt ciphertext without exposing an object URL', async () => {
    downloadMock.mockResolvedValue({ ciphertext: new Uint8Array([1]), mediaType: 'image/png', target: 1 })
    decryptMock.mockRejectedValue(new Error('authentication failed'))

    const { result } = renderHook(() => useEncryptedAssetUrl(scope, new Uint8Array(32).fill(4)))
    await waitFor(() => expect(result.current.corrupt).toBe(true))
    expect(result.current.url).toBeNull()
  })
})
