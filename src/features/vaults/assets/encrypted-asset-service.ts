import {
  encryptPresentationAsset,
  validatePresentationAssetDimensions,
  type EncryptedAssetMediaType,
  type EncryptedAssetScope,
} from '../../../shared/crypto/vault-v2-assets'
import { uploadEncryptedAsset } from './encrypted-asset-api'

const allowedTypes = new Set<EncryptedAssetMediaType>(['image/jpeg', 'image/png', 'image/webp'])

export class InvalidPresentationAssetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPresentationAssetError'
  }
}

export async function encryptAndUploadPresentationAsset(input: {
  file: File
  scope: Omit<EncryptedAssetScope, 'assetId'> & { assetId?: string }
  baseKey: Uint8Array
}): Promise<{ assetId: string; iconReference: string }> {
  if (!allowedTypes.has(input.file.type as EncryptedAssetMediaType)) {
    throw new InvalidPresentationAssetError('Unsupported icon media type')
  }
  const mediaType = input.file.type as EncryptedAssetMediaType
  await validatePresentationAssetDimensions(input.file)
  const assetId = input.scope.assetId ?? crypto.randomUUID()
  const plaintext = new Uint8Array(await input.file.arrayBuffer())
  try {
    const encrypted = await encryptPresentationAsset(plaintext, mediaType, { ...input.scope, assetId }, input.baseKey)
    await uploadEncryptedAsset({
      vaultId: input.scope.vaultId,
      assetId,
      target: input.scope.target,
      ...(input.scope.entryId ? { entryId: input.scope.entryId } : {}),
      mediaType,
      ciphertext: encrypted.ciphertext,
    })
    return { assetId, iconReference: `asset:${assetId}` }
  } finally {
    plaintext.fill(0)
  }
}
