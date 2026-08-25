import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { fromBase64 } from '../../shared/crypto/encoding'
import { openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import {
  buildScriptExecutionManifest,
  sealScriptExecutionPackage,
  type ScriptExecutionEncryptedPackageV1,
  type ScriptExecutionPackageReferenceInput,
} from '../../shared/crypto/script-execution'
import { wipe } from '../../shared/crypto/sodium'
import { encodeMemberSecret, type MemberSecretV1 } from '../../shared/crypto/vault-plaintext'
import { getCanonicalEntry, type CanonicalEntryDetail } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'

const MANIFEST_SIGNING_PRIVATE_PURPOSE = 4

export interface ScriptPackageEntryOverride {
  detail: CanonicalEntryDetail
  secret: MemberSecretV1
  revision: string
}

export interface BuildScriptExecutionPackageInput {
  organizationId: string
  vaultId: string
  scriptEntryId: string
  agentId: string
  agentAccessEpoch: number
  grantId: string
  packageRevision: string
  recipientAgentKeyVersion: number
  agentPublicKey: string
  vaultKey: Uint8Array
  overrides?: ReadonlyMap<string, ScriptPackageEntryOverride>
}

/**
 * Builds the one complete direct ScriptExecution package in browser memory.
 * The backend receives only the returned opaque ciphertext and structural
 * revision bindings; Script source, selectors and referenced plaintext never
 * cross this boundary independently.
 */
export async function buildCompleteScriptExecutionPackage(
  input: BuildScriptExecutionPackageInput,
): Promise<ScriptExecutionEncryptedPackageV1> {
  const encodedReferences: ScriptExecutionPackageReferenceInput[] = []
  const recipientPublicKey = fromBase64(input.agentPublicKey)
  let vaultSigningPrivateKey: Uint8Array | undefined
  try {
    const vault = await getEncryptedVault(input.vaultId)
    if (vault.organizationId !== input.organizationId) {
      throw new Error('Script package Vault organization mismatch')
    }
    const signingEnvelope = vault.vaultPrivateKeys.find(
      (candidate) => candidate.descriptor.purpose === MANIFEST_SIGNING_PRIVATE_PURPOSE,
    )
    if (!signingEnvelope
      || signingEnvelope.descriptor.keyVersion !== vault.currentKeyEpoch.manifestSigningKeyVersion) {
      throw new Error('Current Vault signing material is unavailable')
    }
    vaultSigningPrivateKey = await openVaultDerivedEnvelope(signingEnvelope, input.vaultKey)
    if (vaultSigningPrivateKey.length !== 32 && vaultSigningPrivateKey.length !== 64) {
      throw new Error('Current Vault signing key has an invalid length')
    }
    const script = await openEntry(input.scriptEntryId, input)
    if (script.secret.entryType !== 'script') throw new Error('ScriptExecution parent is not a Script')
    const referencedIds = [...new Set(script.secret.content.refs.map((reference) => reference.entryId))]
    const references = await Promise.all(referencedIds.map((entryId) => openEntry(entryId, input)))
    const referenceRevisions: Record<string, string> = {}
    for (const reference of references) {
      referenceRevisions[reference.detail.id] = reference.revision
      const encodedMemberSecret = encodeMemberSecret(reference.secret)
      encodedReferences.push({
        entryId: reference.detail.id,
        entryRevision: reference.revision,
        encodedMemberSecret,
      })
    }
    const manifest = buildScriptExecutionManifest({
      organizationId: input.organizationId,
      agentId: input.agentId,
      agentAccessEpoch: input.agentAccessEpoch,
      vaultId: input.vaultId,
      scriptEntryId: input.scriptEntryId,
      scriptRevision: script.revision,
      memberSecret: script.secret,
      referenceRevisions,
    })
    return await sealScriptExecutionPackage({
      manifest,
      grantId: input.grantId,
      packageRevision: input.packageRevision,
      recipientAgentKeyVersion: input.recipientAgentKeyVersion,
      recipientAgentPublicKey: recipientPublicKey,
      vaultSigningKeyVersion: vault.currentKeyEpoch.manifestSigningKeyVersion,
      vaultSigningPrivateKey,
      entries: encodedReferences,
    })
  } finally {
    wipe(recipientPublicKey)
    if (vaultSigningPrivateKey) wipe(vaultSigningPrivateKey)
    for (const reference of encodedReferences) wipe(reference.encodedMemberSecret)
  }
}

async function openEntry(
  entryId: string,
  input: BuildScriptExecutionPackageInput,
): Promise<ScriptPackageEntryOverride> {
  const override = input.overrides?.get(entryId)
  if (override) {
    assertEntryCoordinates(override.detail, entryId, input)
    if (override.revision !== override.detail.currentRevision
      && BigInt(override.revision) !== BigInt(override.detail.currentRevision) + 1n) {
      throw new Error('Script package override revision is invalid')
    }
    return override
  }
  const detail = await getCanonicalEntry(input.vaultId, entryId)
  assertEntryCoordinates(detail, entryId, input)
  const secret = await openMemberSecret(detail.entryKey, detail.memberSecret, input.vaultKey, {
    organizationId: input.organizationId,
    vaultId: input.vaultId,
    entryId,
    revision: detail.currentRevision,
  })
  return { detail, secret, revision: detail.currentRevision }
}

function assertEntryCoordinates(
  detail: CanonicalEntryDetail,
  entryId: string,
  input: Pick<BuildScriptExecutionPackageInput, 'organizationId' | 'vaultId'>,
): void {
  if (detail.organizationId !== input.organizationId
    || detail.vaultId !== input.vaultId
    || detail.id !== entryId) {
    throw new Error('Script package Entry scope mismatch')
  }
}
