import { z } from 'zod'

export const canonicalUuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
export const canonicalU64Schema = z.string().regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine((value) => BigInt(value) <= 0xffffffffffffffffn)
export const u32Schema = z.number().int().min(0).max(0xffffffff)

export const vaultEnvelopeHeaderSchema = z.object({
  protocolVersion: z.literal(2),
  algorithmSuite: z.literal(1),
  resourceKind: z.number().int().min(0).max(0xffff),
  projectionKind: z.number().int().min(0).max(0xffff),
  resourceRevision: canonicalU64Schema,
  keyVersion: u32Schema,
  memberKeyGeneration: u32Schema,
  nonce: z.string(),
}).strict()

export const vaultDiscoveryKeyEnvelopeSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  discoveryKeyRevision: canonicalU64Schema,
  vdkVersion: u32Schema,
  memberKeyGeneration: u32Schema,
  wrappingKeyVersion: u32Schema,
  header: vaultEnvelopeHeaderSchema,
  ciphertext: z.string(),
}).strict()

export const vaultPrivateKeyEnvelopeSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  privateKeyKind: z.union([z.literal(1), z.literal(2)]),
  privateKeyRevision: canonicalU64Schema,
  privateKeyVersion: u32Schema,
  memberKeyGeneration: u32Schema,
  wrappingKeyVersion: u32Schema,
  header: vaultEnvelopeHeaderSchema,
  ciphertext: z.string(),
}).strict()

export type VaultDiscoveryKeyEnvelope = z.infer<typeof vaultDiscoveryKeyEnvelopeSchema>
export type VaultPrivateKeyEnvelope = z.infer<typeof vaultPrivateKeyEnvelopeSchema>
