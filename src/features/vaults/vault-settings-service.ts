import { parseJwtPayload } from '../../shared/lib/jwt'
import {
  decryptMemberVaultMetadata,
  encryptMemberVaultMetadata,
  openMemberVaultKey,
  type MemberVaultMetadata,
} from '../../shared/crypto/vault-v2-member-sync'
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

function equalMetadata(left: MemberVaultMetadata, right: MemberVaultMetadata): boolean {
  return canonicalizeVaultJson(left as CanonicalJson) === canonicalizeVaultJson(right as CanonicalJson)
}

function assetId(reference: string | undefined): string | null {
  const match = /^asset:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(reference ?? '')
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

function sameEnvelope(left: { metadataRevision: string; ciphertext: string; header: { nonce: string } }, right: typeof left): boolean {
  return left.metadataRevision === right.metadataRevision
    && left.ciphertext === right.ciphertext
    && left.header.nonce === right.header.nonce
}

async function observeMetadataWrite(
  vaultId: string,
  attempted: { metadataRevision: string; ciphertext: string; header: { nonce: string } },
): Promise<'committed' | 'rejected' | 'ambiguous'> {
  try {
    const observed = await getEncryptedVault(vaultId)
    if (sameEnvelope(observed.memberVaultMetadata, attempted)) return 'committed'
    const observedRevision = BigInt(observed.memberVaultMetadata.metadataRevision)
    const attemptedRevision = BigInt(attempted.metadataRevision)
    return observedRevision <= attemptedRevision ? 'rejected' : 'ambiguous'
  } catch {
    return 'ambiguous'
  }
}

export async function updateEncryptedVaultSettings(input: {
  vaultId: string
  expectedMetadata: MemberVaultMetadata
  nextMetadata: MemberVaultMetadata
  iconFile?: File
}): Promise<MemberVaultMetadata> {
  const auth = useAuthStore.getState()
  if (!auth.privateKey || !auth.userId || !auth.accessToken) throw new VaultSettingsLockedError()
  const organizationId = parseJwtPayload(auth.accessToken)['org_id']
  if (typeof organizationId !== 'string') throw new VaultSettingsLockedError()

  const fresh = await getEncryptedVault(input.vaultId)
  const keyVersion = fresh.currentKeyEpoch.vaultKeyVersion
  const vaultKey = await openMemberVaultKey(fresh.memberVaultKey, {
    organizationId,
    vaultId: input.vaultId,
    memberId: auth.userId,
    vkVersion: keyVersion,
    memberKeyGeneration: fresh.memberKeyGeneration,
  }, auth.privateKey)
  let uploadedAssetId: string | null = null
  let metadataCommitted = false
  let writeOutcomeAmbiguous = false
  try {
    const currentMetadata = await decryptMemberVaultMetadata(fresh.memberVaultMetadata, {
      organizationId,
      vaultId: input.vaultId,
      keyVersion,
      memberKeyGeneration: fresh.memberKeyGeneration,
    }, vaultKey)
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

    const revision = (BigInt(fresh.memberVaultMetadata.metadataRevision) + 1n).toString()
    const envelope = await encryptMemberVaultMetadata(nextMetadata, {
      organizationId,
      vaultId: input.vaultId,
      metadataRevision: revision,
      keyVersion,
      memberKeyGeneration: fresh.memberKeyGeneration,
    }, vaultKey)
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
