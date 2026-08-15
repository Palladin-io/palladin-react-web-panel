import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'

const mocks = vi.hoisted(() => ({
  getVault: vi.fn(),
  openKey: vi.fn(),
  download: vi.fn(),
  decrypt: vi.fn(),
  dimensions: vi.fn(),
}))
vi.mock('../../../shared/lib/jwt', () => ({ parseJwtPayload: () => ({ org_id: '00112233-4455-4677-8899-aabbccddeeff' }) }))
vi.mock('../sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('./encrypted-asset-api', () => ({ downloadEncryptedAsset: mocks.download }))
vi.mock('../../../shared/crypto/vault-protocol', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/vault-protocol')>(),
  openMemberVaultKey: mocks.openKey,
}))
vi.mock('../../../shared/crypto/vault-v2-assets', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/vault-v2-assets')>(),
  decryptPresentationAsset: mocks.decrypt,
  validatePresentationAssetDimensions: mocks.dimensions,
}))

import { useVaultEncryptedAssetUrl } from './use-vault-encrypted-asset-url'

const vaultId = '11112233-4455-4677-8899-aabbccddeeff'
const assetId = '22222233-4455-4677-8899-aabbccddeeff'
const entryId = '44442233-4455-4677-8899-aabbccddeeff'

describe('useVaultEncryptedAssetUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      accessToken: 'token',
      userId: '33332233-4455-4677-8899-aabbccddeeff',
      privateKey: new Uint8Array(32).fill(3),
      isVaultLocked: false,
    })
    mocks.getVault.mockResolvedValue({
      memberKeyGeneration: 2,
      currentKeyEpoch: { vaultKeyVersion: 4 },
      memberVaultKey: {},
    })
    mocks.openKey.mockResolvedValue(new Uint8Array(32).fill(8))
    mocks.download.mockResolvedValue({ ciphertext: new Uint8Array([1]), mediaType: 'image/png', target: 1 })
    mocks.decrypt.mockResolvedValue({ bytes: new Uint8Array([1, 2]), mediaType: 'image/png' })
    mocks.dimensions.mockResolvedValue(undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vault-icon')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.getState().lockVault()
  })

  it('creates a local URL and revokes it immediately when the vault locks', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const { result } = renderHook(() => useVaultEncryptedAssetUrl(vaultId, assetId))
    await waitFor(() => expect(result.current.url).toBe('blob:vault-icon'))

    act(() => useAuthStore.getState().lockVault())
    await waitFor(() => expect(result.current.url).toBeNull())
    expect(revoke).toHaveBeenCalledWith('blob:vault-icon')
  })

  it('fails closed when ciphertext authentication fails', async () => {
    mocks.decrypt.mockRejectedValue(new Error('authentication failed'))
    const { result } = renderHook(() => useVaultEncryptedAssetUrl(vaultId, assetId))
    await waitFor(() => expect(result.current.corrupt).toBe(true))
    expect(result.current.url).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('authenticates and decrypts an entry-scoped presentation asset', async () => {
    mocks.download.mockResolvedValue({
      ciphertext: new Uint8Array([1]),
      mediaType: 'image/png',
      target: 2,
      entryId,
    })
    const { result } = renderHook(() => useVaultEncryptedAssetUrl(vaultId, assetId, entryId))
    await waitFor(() => expect(result.current.url).toBe('blob:vault-icon'))

    expect(mocks.decrypt).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ vaultId, assetId, entryId, target: 2 }),
      expect.any(Uint8Array),
    )
  })
})
