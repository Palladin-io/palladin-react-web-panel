import { z } from 'zod'
import {
  canonicalU64Schema,
  canonicalUuidSchema,
  u32Schema,
  vaultEnvelopeHeaderSchema,
} from './vault-key-material-schema'

export const memberIndexEnvelopeSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  entryId: canonicalUuidSchema,
  memberIndexRevision: canonicalU64Schema,
  header: vaultEnvelopeHeaderSchema,
  ciphertext: z.string(),
}).strict()

export const vaultEntryKeyEnvelopeSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  entryId: canonicalUuidSchema,
  wrapperRevision: canonicalU64Schema,
  keyVersion: u32Schema,
  memberKeyGeneration: u32Schema,
  wrappingKeyVersion: u32Schema,
  header: vaultEnvelopeHeaderSchema,
  wrappedEntryDekByVk: z.string(),
}).strict().superRefine((entryKey, context) => {
  if (entryKey.wrapperRevision !== entryKey.header.resourceRevision
    || entryKey.keyVersion !== entryKey.header.keyVersion
    || entryKey.memberKeyGeneration !== entryKey.header.memberKeyGeneration) {
    context.addIssue({ code: 'custom', message: 'Entry key envelope binding mismatch' })
  }
})

export type MemberIndexEnvelopeContract = z.infer<typeof memberIndexEnvelopeSchema>
export type VaultEntryKeyEnvelopeContract = z.infer<typeof vaultEntryKeyEnvelopeSchema>
