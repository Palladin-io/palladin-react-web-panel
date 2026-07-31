import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEncryptedVault: vi.fn(),
  openVaultProjection: vi.fn(),
  encryptMemberVaultMetadata: vi.fn(),
  upload: vi.fn(),
  deleteAsset: vi.fn(),
  put: vi.fn(),
}))

vi.mock('../../shared/lib/jwt', () => ({ parseJwtPayload: () => ({ org_id: '00112233-4455-4677-8899-aabbccddeeff' }) }))
vi.mock('../auth', () => ({
  useAuthStore: {
    getState: () => ({
      privateKey: new Uint8Array(32).fill(4),
      userId: '11112233-4455-4677-8899-aabbccddeeff',
      accessToken: 'token',
    }),
  },
}))
vi.mock('../../shared/crypto/vault-protocol', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/vault-protocol')>(),
  openVaultProjection: mocks.openVaultProjection,
  sealMemberVaultMetadata: mocks.encryptMemberVaultMetadata,
}))
vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getEncryptedVault }))
vi.mock('./assets/encrypted-asset-service', () => ({ encryptAndUploadPresentationAsset: mocks.upload }))
vi.mock('./assets/encrypted-asset-api', () => ({ deleteEncryptedAsset: mocks.deleteAsset }))
vi.mock('../../shared/api/client', () => ({ api: { put: mocks.put } }))

import { updateEncryptedVaultSettings, VaultMetadataConflictError } from './vault-settings-service'

const vaultId = '22222233-4455-4677-8899-aabbccddeeff'
const current = { name: 'Production', description: 'Current', iconReference: 'asset:33332233-4455-4677-8899-aabbccddeeff' }
const next = { name: 'Production 2', description: 'Current' }
const summary = {
  id: vaultId,
  memberKeyGeneration: 3,
  currentKeyEpoch: { vaultKeyVersion: 7 },
  memberVaultMetadata: { descriptor: { resourceRevision: '12' }, encodedSuitePayload: 'old' },
  memberVaultKey: {},
}
const encryptedEnvelope = {
  descriptor: { resourceRevision: '13' },
  encodedSuitePayload: 'opaque-envelope',
}

describe('encrypted Vault settings transaction', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEncryptedVault.mockResolvedValue(summary)
    mocks.openVaultProjection.mockResolvedValue({
      vaultKey: new Uint8Array(32).fill(9),
      metadata: {
        schema: 'palladin.member-vault-metadata.v1', name: current.name,
        description: current.description,
        icon: { kind: 'encryptedAsset', assetId: '33332233-4455-4677-8899-aabbccddeeff' },
        color: null, grantMode: 'full',
      },
    })
    mocks.encryptMemberVaultMetadata.mockResolvedValue(encryptedEnvelope)
    mocks.put.mockResolvedValue(new Response(null, { status: 204 }))
    mocks.deleteAsset.mockResolvedValue(undefined)
  })

  it('fails before upload when the fresh authenticated revision differs from the edited base', async () => {
    await expect(updateEncryptedVaultSettings({
      vaultId,
      expectedMetadata: { ...current, description: 'stale' },
      nextMetadata: next,
    })).rejects.toBeInstanceOf(VaultMetadataConflictError)

    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('compensates a newly uploaded asset when the metadata compare-and-swap loses a race', async () => {
    const generatedAssetId = '44442233-4455-4677-8899-aabbccddeeff'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedAssetId)
    mocks.upload.mockResolvedValue({ assetId: generatedAssetId, iconReference: `asset:${generatedAssetId}` })
    mocks.put.mockResolvedValue(new Response(null, { status: 409 }))

    await expect(updateEncryptedVaultSettings({
      vaultId,
      expectedMetadata: current,
      nextMetadata: next,
      iconFile: new File(['image'], 'icon.png', { type: 'image/png' }),
    })).rejects.toBeInstanceOf(VaultMetadataConflictError)

    expect(mocks.deleteAsset).toHaveBeenCalledWith(vaultId, generatedAssetId)
  })

  it('commits only an encrypted envelope, then removes the superseded asset', async () => {
    const generatedAssetId = '44442233-4455-4677-8899-aabbccddeeff'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedAssetId)
    mocks.upload.mockResolvedValue({ assetId: generatedAssetId, iconReference: `asset:${generatedAssetId}` })

    const committed = await updateEncryptedVaultSettings({
      vaultId,
      expectedMetadata: current,
      nextMetadata: next,
      iconFile: new File(['image'], 'icon.png', { type: 'image/png' }),
    })

    expect(mocks.encryptMemberVaultMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ id: vaultId, memberKeyGeneration: 3 }),
      summary.memberVaultMetadata,
      expect.objectContaining({
        schema: 'palladin.member-vault-metadata.v1', name: next.name,
        icon: { kind: 'encryptedAsset', assetId: generatedAssetId }, grantMode: 'full',
      }),
      expect.any(Uint8Array),
    )
    expect(mocks.put).toHaveBeenCalledWith(`api/vaults/${vaultId}`, {
      json: { memberVaultMetadata: encryptedEnvelope },
      throwHttpErrors: false,
    })
    expect(mocks.deleteAsset).toHaveBeenCalledWith(vaultId, '33332233-4455-4677-8899-aabbccddeeff')
    expect(committed.iconReference).toBe(`asset:${generatedAssetId}`)
  })

  it('keeps the referenced asset when a lost response is reconciled as committed', async () => {
    const generatedAssetId = '44442233-4455-4677-8899-aabbccddeeff'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedAssetId)
    mocks.upload.mockResolvedValue({ assetId: generatedAssetId, iconReference: `asset:${generatedAssetId}` })
    mocks.put.mockRejectedValue(new TypeError('network response lost'))
    mocks.getEncryptedVault
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ ...summary, memberVaultMetadata: encryptedEnvelope })

    await expect(updateEncryptedVaultSettings({
      vaultId,
      expectedMetadata: current,
      nextMetadata: next,
      iconFile: new File(['image'], 'icon.png', { type: 'image/png' }),
    })).resolves.toMatchObject({ iconReference: `asset:${generatedAssetId}` })

    expect(mocks.deleteAsset).not.toHaveBeenCalledWith(vaultId, generatedAssetId)
  })

  it('does not risk deleting a possibly committed asset when reconciliation is unavailable', async () => {
    const generatedAssetId = '44442233-4455-4677-8899-aabbccddeeff'
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(generatedAssetId)
    mocks.upload.mockResolvedValue({ assetId: generatedAssetId, iconReference: `asset:${generatedAssetId}` })
    mocks.put.mockRejectedValue(new TypeError('network response lost'))
    mocks.getEncryptedVault.mockResolvedValueOnce(summary).mockRejectedValueOnce(new Error('offline'))

    await expect(updateEncryptedVaultSettings({
      vaultId,
      expectedMetadata: current,
      nextMetadata: next,
      iconFile: new File(['image'], 'icon.png', { type: 'image/png' }),
    })).rejects.toThrow('network response lost')

    expect(mocks.deleteAsset).not.toHaveBeenCalledWith(vaultId, generatedAssetId)
  })
})
