import {
  MAXIMUM_ICON_PLAINTEXT_BYTES,
  encryptPresentationAsset,
  validatePresentationAsset,
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
  await validatePresentationAssetFile(input.file)
  const mediaType = input.file.type as EncryptedAssetMediaType
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
    return { assetId, iconReference: `vault-asset:${assetId}` }
  } finally {
    plaintext.fill(0)
  }
}

export async function validatePresentationAssetFile(file: File): Promise<void> {
  if (!allowedTypes.has(file.type as EncryptedAssetMediaType)) {
    throw new InvalidPresentationAssetError('Unsupported icon media type')
  }
  if (file.size === 0 || file.size > MAXIMUM_ICON_PLAINTEXT_BYTES) {
    throw new InvalidPresentationAssetError('Icon exceeds size limit')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    validatePresentationAsset(bytes, file.type as EncryptedAssetMediaType)
    await validatePresentationAssetDimensions(file)
  } finally {
    bytes.fill(0)
  }
}
