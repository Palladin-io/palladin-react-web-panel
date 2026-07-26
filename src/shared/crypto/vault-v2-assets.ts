import { concatBytes, decodeUuid, encodeU16, encodeU32, encodeUtf8 } from './vault-v2-bytes'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import { loadSodium, wipe } from './sodium'

export const MAXIMUM_ICON_PLAINTEXT_BYTES = 2 * 1024 * 1024
export const MAXIMUM_ICON_DIMENSION = 2_048
export const MAXIMUM_ENCRYPTED_ASSET_BYTES = MAXIMUM_ICON_PLAINTEXT_BYTES + 96

export type EncryptedAssetMediaType = 'image/jpeg' | 'image/png' | 'image/webp'
export type EncryptedAssetTarget = 1 | 2

export interface EncryptedAssetScope {
  organizationId: string
  vaultId: string
  assetId: string
  target: EncryptedAssetTarget
  entryId?: string
  keyVersion: number
  memberKeyGeneration: number
}

export interface EncryptedAssetPackage {
  assetId: string
  mediaType: EncryptedAssetMediaType
  ciphertext: Uint8Array
}

const MAGIC = encodeUtf8('PLDNV2AS')
const HEADER_BYTES = 84
const mediaTypeIds: Record<EncryptedAssetMediaType, number> = {
  'image/jpeg': 1,
  'image/png': 2,
  'image/webp': 3,
}
const mediaTypes = new Map(Object.entries(mediaTypeIds).map(([type, id]) => [id, type as EncryptedAssetMediaType]))

function assertScope(scope: EncryptedAssetScope): void {
  decodeUuid(scope.organizationId)
  decodeUuid(scope.vaultId)
  decodeUuid(scope.assetId)
  if (scope.target !== 1 && scope.target !== 2) throw new Error('Unsupported encrypted asset target')
  if ((scope.target === 2) !== Boolean(scope.entryId)) throw new Error('Entry scope must match encrypted asset target')
  if (scope.entryId) decodeUuid(scope.entryId)
  encodeU32(scope.keyVersion)
  encodeU32(scope.memberKeyGeneration)
}

function header(scope: EncryptedAssetScope, mediaType: EncryptedAssetMediaType, nonce: Uint8Array): Uint8Array {
  assertScope(scope)
  if (nonce.length !== 24) throw new Error('Encrypted asset nonce must be 24 bytes')
  return concatBytes(
    MAGIC,
    encodeU16(1),
    encodeU16(2),
    encodeU16(1),
    encodeU16(scope.target),
    encodeU16(mediaTypeIds[mediaType]),
    encodeU16(0),
    encodeU32(scope.keyVersion),
    encodeU32(scope.memberKeyGeneration),
    decodeUuid(scope.assetId),
    scope.entryId ? decodeUuid(scope.entryId) : new Uint8Array(16),
    nonce,
  )
}

function aad(scope: EncryptedAssetScope, mediaType: EncryptedAssetMediaType): Uint8Array {
  return concatBytes(
    encodeUtf8('PLDNV2AA'),
    encodeU16(1),
    decodeUuid(scope.organizationId),
    decodeUuid(scope.vaultId),
    decodeUuid(scope.assetId),
    encodeU16(scope.target),
    scope.entryId ? decodeUuid(scope.entryId) : new Uint8Array(16),
    encodeU16(mediaTypeIds[mediaType]),
    encodeU32(scope.keyVersion),
    encodeU32(scope.memberKeyGeneration),
  )
}

function parseHeader(container: Uint8Array): {
  target: EncryptedAssetTarget
  mediaType: EncryptedAssetMediaType
  keyVersion: number
  memberKeyGeneration: number
  assetIdBytes: Uint8Array
  entryIdBytes: Uint8Array
  nonce: Uint8Array
} {
  if (container.length <= HEADER_BYTES + 16 || container.length > MAXIMUM_ENCRYPTED_ASSET_BYTES) {
    throw new Error('Encrypted asset container exceeds protocol limits')
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (container[index] !== MAGIC[index]) throw new Error('Invalid encrypted asset container')
  }
  const view = new DataView(container.buffer, container.byteOffset, HEADER_BYTES)
  if (view.getUint16(8, false) !== 1 || view.getUint16(10, false) !== 2 || view.getUint16(12, false) !== 1) {
    throw new Error('Unsupported encrypted asset container version')
  }
  const target = view.getUint16(14, false)
  if (target !== 1 && target !== 2) throw new Error('Unsupported encrypted asset target')
  const mediaType = mediaTypes.get(view.getUint16(16, false))
  if (!mediaType || view.getUint16(18, false) !== 0) throw new Error('Invalid encrypted asset header')
  return {
    target,
    mediaType,
    keyVersion: view.getUint32(20, false),
    memberKeyGeneration: view.getUint32(24, false),
    assetIdBytes: container.slice(28, 44),
    entryIdBytes: container.slice(44, 60),
    nonce: container.slice(60, 84),
  }
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

export async function encryptPresentationAsset(
  plaintext: Uint8Array,
  mediaType: EncryptedAssetMediaType,
  scope: EncryptedAssetScope,
  baseKey: Uint8Array,
): Promise<EncryptedAssetPackage> {
  validatePresentationAsset(plaintext, mediaType)
  assertScope(scope)
  const key = await deriveVaultProjectionKey({
    baseKey,
    purpose: 'encrypted-asset',
    resourceKind: scope.target,
    organizationId: scope.organizationId,
    vaultId: scope.vaultId,
    ...(scope.entryId ? { entryId: scope.entryId } : {}),
    keyVersion: scope.keyVersion,
    memberKeyGeneration: scope.memberKeyGeneration,
  })
  const sodium = await loadSodium()
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const authenticatedData = aad(scope, mediaType)
  try {
    const encrypted = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, authenticatedData, null, nonce, key)
    return { assetId: scope.assetId, mediaType, ciphertext: concatBytes(header(scope, mediaType, nonce), encrypted) }
  } finally {
    wipe(key)
    wipe(nonce)
    wipe(authenticatedData)
  }
}

export async function decryptPresentationAsset(
  container: Uint8Array,
  expected: EncryptedAssetScope,
  baseKey: Uint8Array,
): Promise<{ bytes: Uint8Array; mediaType: EncryptedAssetMediaType }> {
  assertScope(expected)
  const parsed = parseHeader(container)
  if (parsed.target !== expected.target
    || parsed.keyVersion !== expected.keyVersion
    || parsed.memberKeyGeneration !== expected.memberKeyGeneration
    || !equal(parsed.assetIdBytes, decodeUuid(expected.assetId))
    || !equal(parsed.entryIdBytes, expected.entryId ? decodeUuid(expected.entryId) : new Uint8Array(16))) {
    throw new Error('Encrypted asset scope mismatch')
  }
  const key = await deriveVaultProjectionKey({
    baseKey,
    purpose: 'encrypted-asset',
    resourceKind: expected.target,
    organizationId: expected.organizationId,
    vaultId: expected.vaultId,
    ...(expected.entryId ? { entryId: expected.entryId } : {}),
    keyVersion: expected.keyVersion,
    memberKeyGeneration: expected.memberKeyGeneration,
  })
  const authenticatedData = aad(expected, parsed.mediaType)
  const sodium = await loadSodium()
  try {
    const bytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      container.subarray(HEADER_BYTES),
      authenticatedData,
      parsed.nonce,
      key,
    )
    validatePresentationAsset(bytes, parsed.mediaType)
    return { bytes, mediaType: parsed.mediaType }
  } finally {
    wipe(key)
    wipe(authenticatedData)
    wipe(parsed.nonce)
  }
}

export function validatePresentationAsset(bytes: Uint8Array, mediaType: EncryptedAssetMediaType): void {
  if (bytes.length === 0 || bytes.length > MAXIMUM_ICON_PLAINTEXT_BYTES) throw new Error('Icon exceeds size limit')
  const signatureMatches = mediaType === 'image/png'
    ? bytes.length >= 24 && equal(bytes.subarray(0, 8), Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10))
    : mediaType === 'image/jpeg'
      ? bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
      : bytes.length >= 30 && new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF'
        && new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
  if (!signatureMatches) throw new Error('Icon content does not match its media type')
}

export async function validatePresentationAssetDimensions(blob: Blob): Promise<void> {
  if (typeof createImageBitmap !== 'function') throw new Error('Secure image validation is unavailable')
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(blob)
    if (bitmap.width < 1 || bitmap.height < 1
      || bitmap.width > MAXIMUM_ICON_DIMENSION || bitmap.height > MAXIMUM_ICON_DIMENSION) {
      throw new Error('Icon dimensions exceed limit')
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Icon dimensions exceed limit') throw error
    throw new Error('Icon image is corrupt')
  } finally {
    bitmap?.close()
  }
}

export function isEncryptedAssetReference(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^asset:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
}
