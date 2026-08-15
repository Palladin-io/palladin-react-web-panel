import { z } from 'zod'
import { api } from '../../../shared/api/client'
import { fromBase64, fromBase64Url, toBase64 } from '../../../shared/crypto/encoding'
import type { buildCanonicalGrantEnvelope } from '../../../shared/crypto/grant-protocol'
import { loadSodium, wipe } from '../../../shared/crypto/sodium'
import { computeVaultKeyFingerprint, VAULT_KEY_KIND } from '../../../shared/crypto/x25519-wrapper'
import {
  memberSecretEnvelopeSchema,
  vaultEntryKeyEnvelopeSchema,
} from '../../vaults/sync/entry-envelope-schema'
import {
  canonicalU64Schema,
  canonicalUuidSchema,
  u32Schema,
} from '../../vaults/sync/vault-key-material-schema'

export const FULL_GRANT_PREPARATION_PAGE_SIZE = 100

export interface PrepareFullGrantBody {
  grantId: string
  agentId: string
  methods: string
  expiresAt?: string
  queryLimit?: number
}

const fullGrantPreparationSchema = z.object({
  grantId: canonicalUuidSchema,
  organizationId: canonicalUuidSchema,
  preparationExpiresAt: z.string().datetime({ offset: true }),
  memberKeyGeneration: u32Schema,
  agentAccessEpoch: u32Schema,
  recipientAgentKeyVersion: u32Schema,
  agentKeyFingerprint: z.string().min(1),
  agentPublicKey: z.string().min(1),
}).strict()

const fullGrantMaterialItemSchema = z.object({
  entryId: canonicalUuidSchema,
  entryRevision: canonicalU64Schema,
  entryKey: vaultEntryKeyEnvelopeSchema,
  memberSecret: memberSecretEnvelopeSchema,
}).strict().superRefine((item, context) => {
  const descriptors = [item.entryKey.descriptor, item.memberSecret.descriptor]
  if (descriptors.some((descriptor) => descriptor.scope.entryId !== item.entryId)
    || item.memberSecret.descriptor.resourceRevision !== item.entryRevision
    || item.memberSecret.descriptor.keyVersion !== item.entryKey.descriptor.keyVersion) {
    context.addIssue({ code: 'custom', message: 'Full grant material head mismatch' })
  }
})

const fullGrantMaterialPageSchema = z.object({
  items: z.array(fullGrantMaterialItemSchema).max(FULL_GRANT_PREPARATION_PAGE_SIZE),
  nextAfterEntryId: canonicalUuidSchema.nullable(),
}).strict()

const appendFullGrantEntriesResponseSchema = z.object({
  acceptedEntries: z.number().int().min(0).max(FULL_GRANT_PREPARATION_PAGE_SIZE),
  totalPreparedEntries: z.number().int().nonnegative(),
}).strict()

const committedFullGrantSchema = z.object({ id: canonicalUuidSchema }).strict()

export type FullGrantPreparation = z.infer<typeof fullGrantPreparationSchema>
export type FullGrantMaterialItem = z.infer<typeof fullGrantMaterialItemSchema>
export type FullGrantMaterialPage = z.infer<typeof fullGrantMaterialPageSchema>
export type CanonicalGrantEnvelope = Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>

export interface FullGrantMaterialScope {
  organizationId: string
  memberKeyGeneration: number
}

function preparationPath(vaultId: string, grantId?: string): string {
  const base = `api/vaults/${vaultId}/grants/full/preparations`
  return grantId ? `${base}/${grantId}` : base
}

export async function prepareFullGrant(
  vaultId: string,
  body: PrepareFullGrantBody,
): Promise<FullGrantPreparation> {
  const raw = await api.post(preparationPath(vaultId), { json: body }).json()
  const preparation = fullGrantPreparationSchema.parse(raw)
  if (preparation.grantId !== body.grantId) throw new Error('Full grant preparation id mismatch')
  await validateRecipientKeyMaterial(preparation.agentPublicKey, preparation.agentKeyFingerprint)
  return preparation
}

export async function getFullGrantPreparationMaterial(
  vaultId: string,
  grantId: string,
  expected: FullGrantMaterialScope,
  afterEntryId?: string,
): Promise<FullGrantMaterialPage> {
  const raw = await api.get(`${preparationPath(vaultId, grantId)}/material`, {
    searchParams: {
      pageSize: String(FULL_GRANT_PREPARATION_PAGE_SIZE),
      ...(afterEntryId ? { afterEntryId } : {}),
    },
  }).json()
  const page = fullGrantMaterialPageSchema.parse(raw)
  for (const item of page.items) {
    const descriptors = [item.entryKey.descriptor, item.memberSecret.descriptor]
    if (descriptors.some((descriptor) => descriptor.scope.organizationId !== expected.organizationId
      || descriptor.scope.vaultId !== vaultId
      || descriptor.memberKeyGeneration !== expected.memberKeyGeneration)) {
      throw new Error('Full grant material scope mismatch')
    }
  }
  if (page.nextAfterEntryId !== null
    && (page.items.length === 0
      || page.items.at(-1)?.entryId !== page.nextAfterEntryId
      || page.nextAfterEntryId === afterEntryId)) {
    throw new Error('Full grant material cursor did not advance')
  }
  return page
}

async function validateRecipientKeyMaterial(publicKeyValue: string, fingerprintValue: string): Promise<void> {
  let publicKey: Uint8Array | undefined
  let fingerprint: Uint8Array | undefined
  let expectedFingerprint: Uint8Array | undefined
  try {
    publicKey = fromBase64(publicKeyValue)
    fingerprint = fromBase64Url(fingerprintValue)
    if (publicKey.length !== 32 || toBase64(publicKey) !== publicKeyValue || fingerprint.length !== 32) {
      throw new Error('invalid key encoding')
    }
    expectedFingerprint = await computeVaultKeyFingerprint(publicKey, VAULT_KEY_KIND.agentX25519)
    const sodium = await loadSodium()
    if (!sodium.memcmp(fingerprint, expectedFingerprint)) throw new Error('fingerprint mismatch')
  } catch {
    throw new Error('Full grant recipient key material is invalid')
  } finally {
    if (publicKey) wipe(publicKey)
    if (fingerprint) wipe(fingerprint)
    if (expectedFingerprint) wipe(expectedFingerprint)
  }
}

export async function appendFullGrantPreparationEntries(
  vaultId: string,
  grantId: string,
  grantEntries: CanonicalGrantEnvelope[],
): Promise<z.infer<typeof appendFullGrantEntriesResponseSchema>> {
  if (grantEntries.length === 0 || grantEntries.length > FULL_GRANT_PREPARATION_PAGE_SIZE) {
    throw new RangeError('Full grant preparation append must contain between 1 and 100 entries')
  }
  const raw = await api.put(`${preparationPath(vaultId, grantId)}/entries`, {
    json: { grantEntries },
  }).json()
  return appendFullGrantEntriesResponseSchema.parse(raw)
}

export async function commitFullGrantPreparation(
  vaultId: string,
  grantId: string,
): Promise<{ id: string }> {
  const raw = await api.post(`${preparationPath(vaultId, grantId)}/commit`).json()
  return committedFullGrantSchema.parse(raw)
}

export async function cancelFullGrantPreparation(vaultId: string, grantId: string): Promise<void> {
  await api.delete(preparationPath(vaultId, grantId))
}
