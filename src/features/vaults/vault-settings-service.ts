import { parseJwtPayload } from '../../shared/lib/jwt'
import {
  openVaultProjection,
  sealMemberVaultMetadata,
} from '../../shared/crypto/vault-protocol'
import type { MemberVaultMetadataV1 } from '../../shared/crypto/vault-plaintext'
import { canonicalizeVaultJson, type CanonicalJson } from '../../shared/crypto/vault-v2-signatures'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { deleteEncryptedAsset } from './assets/encrypted-asset-api'
import { encryptAndUploadPresentationAsset } from './assets/encrypted-asset-service'
import { getEncryptedVault } from './sync/member-sync-api'
import { api } from '../../shared/api/client'

export class VaultSettingsLockedError extends Error {
  constructor() {
    super('Vault must be unlocked before changing encrypted settings')
    this.name = 'VaultSettingsLockedError'
  }
}

export class VaultMetadataConflictError extends Error {
  constructor() {
    super('Vault metadata changed on another client')
    this.name = 'VaultMetadataConflictError'
  }
}

class VaultSettingsRejectedError extends Error {}

export interface EditableVaultMetadata {
  name: string
  description?: string
  iconReference?: string
  color?: string
}

function equalMetadata(left: EditableVaultMetadata, right: EditableVaultMetadata): boolean {
  return canonicalizeVaultJson(left as unknown as CanonicalJson)
    === canonicalizeVaultJson(right as unknown as CanonicalJson)
}

function assetId(reference: string | undefined): string | null {
  const match = /^asset:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(reference ?? '')
  return match?.[1] ?? null
}

async function replaceMetadata(vaultId: string, memberVaultMetadata: unknown): Promise<void> {
  const response = await api.put(`api/vaults/${vaultId}`, {
    json: { memberVaultMetadata },
    throwHttpErrors: false,
  })
  if (response.ok) return
  if (response.status === 400 || response.status === 409) throw new VaultMetadataConflictError()
  throw new VaultSettingsRejectedError(`Encrypted Vault settings update failed with status ${response.status}`)
}

function sameEnvelope(left: { descriptor: { resourceRevision: string }; encodedSuitePayload: string }, right: typeof left): boolean {
  return left.descriptor.resourceRevision === right.descriptor.resourceRevision
    && left.encodedSuitePayload === right.encodedSuitePayload
}

async function observeMetadataWrite(
  vaultId: string,
  attempted: { descriptor: { resourceRevision: string }; encodedSuitePayload: string },
): Promise<'committed' | 'rejected' | 'ambiguous'> {
  try {
    const observed = await getEncryptedVault(vaultId)
    if (sameEnvelope(observed.memberVaultMetadata, attempted)) return 'committed'
    const observedRevision = BigInt(observed.memberVaultMetadata.descriptor.resourceRevision)
    const attemptedRevision = BigInt(attempted.descriptor.resourceRevision)
    return observedRevision <= attemptedRevision ? 'rejected' : 'ambiguous'
  } catch {
    return 'ambiguous'
  }
}

export async function updateEncryptedVaultSettings(input: {
  vaultId: string
  expectedMetadata: EditableVaultMetadata
  nextMetadata: EditableVaultMetadata
  iconFile?: File
}): Promise<EditableVaultMetadata> {
  const auth = useAuthStore.getState()
  if (!auth.privateKey || !auth.userId || !auth.accessToken) throw new VaultSettingsLockedError()
  const organizationId = parseJwtPayload(auth.accessToken)['org_id']
  if (typeof organizationId !== 'string') throw new VaultSettingsLockedError()

  const fresh = await getEncryptedVault(input.vaultId)
  const keyVersion = fresh.currentKeyEpoch.vaultKeyVersion
  const opened = await openVaultProjection({ ...fresh, organizationId }, auth.privateKey, auth.userId)
  const vaultKey = opened.vaultKey
  let uploadedAssetId: string | null = null
  let metadataCommitted = false
  let writeOutcomeAmbiguous = false
  try {
    const currentMetadata: EditableVaultMetadata = {
      name: opened.metadata.name,
      ...(opened.metadata.description ? { description: opened.metadata.description } : {}),
      ...(opened.metadata.icon?.kind === 'glyph' ? { iconReference: opened.metadata.icon.value }
        : opened.metadata.icon?.kind === 'encryptedAsset' ? { iconReference: `asset:${opened.metadata.icon.assetId}` } : {}),
      ...(opened.metadata.color ? { color: opened.metadata.color } : {}),
    }
    if (!equalMetadata(currentMetadata, input.expectedMetadata)) throw new VaultMetadataConflictError()

    let nextMetadata = input.nextMetadata
    if (input.iconFile) {
      uploadedAssetId = crypto.randomUUID()
      const uploaded = await encryptAndUploadPresentationAsset({
        file: input.iconFile,
        scope: {
          assetId: uploadedAssetId,
          organizationId,
          vaultId: input.vaultId,
          target: 1,
          keyVersion,
          memberKeyGeneration: fresh.memberKeyGeneration,
        },
        baseKey: vaultKey,
      })
      nextMetadata = { ...nextMetadata, iconReference: uploaded.iconReference }
    }

    const canonicalMetadata: MemberVaultMetadataV1 = {
      schema: 'palladin.member-vault-metadata.v1', name: nextMetadata.name,
      description: nextMetadata.description ?? null,
      icon: assetId(nextMetadata.iconReference)
        ? { kind: 'encryptedAsset', assetId: assetId(nextMetadata.iconReference)! }
        : nextMetadata.iconReference ? { kind: 'glyph', value: nextMetadata.iconReference } : null,
      color: nextMetadata.color ?? null, grantMode: opened.metadata.grantMode,
    }
    const envelope = await sealMemberVaultMetadata({
      id: fresh.id, organizationId, memberKeyGeneration: fresh.memberKeyGeneration,
    }, fresh.memberVaultMetadata, canonicalMetadata, vaultKey)
    try {
      await replaceMetadata(input.vaultId, envelope)
      metadataCommitted = true
    } catch (error) {
      if (error instanceof VaultMetadataConflictError || error instanceof VaultSettingsRejectedError) throw error
      const observed = await observeMetadataWrite(input.vaultId, envelope)
      if (observed === 'committed') metadataCommitted = true
      else if (observed === 'rejected') throw error
      else {
        writeOutcomeAmbiguous = true
        throw error
      }
    }

    const previousAssetId = assetId(currentMetadata.iconReference)
    if (previousAssetId && previousAssetId !== uploadedAssetId
      && currentMetadata.iconReference !== nextMetadata.iconReference) {
      await deleteEncryptedAsset(input.vaultId, previousAssetId).catch(() => undefined)
    }
    return nextMetadata
  } finally {
    if (uploadedAssetId && !metadataCommitted && !writeOutcomeAmbiguous) {
      await deleteEncryptedAsset(input.vaultId, uploadedAssetId).catch(() => undefined)
    }
    wipe(vaultKey)
  }
}
