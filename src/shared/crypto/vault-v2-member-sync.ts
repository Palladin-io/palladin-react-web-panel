import { z } from 'zod'
import { concatBytes, decodeBase64Url, encodeBase64Url, encodeU16, encodeUtf8 } from './vault-v2-bytes'
import { decryptVaultEnvelope, openVaultProtocolPackage, type VaultCiphertextEnvelope } from './vault-v2-envelope'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import { VAULT_PROTOCOL_VERSION, type VaultEnvelopeHeader } from './vault-v2-protocol'
import { canonicalizeVaultJson } from './vault-v2-signatures'
import { loadSodium, wipe } from './sodium'

function nfcString(maximumBytes: number) {
  return z.string().refine((value) => {
    try {
      return encodeUtf8(value).length <= maximumBytes
    } catch {
      return false
    }
  }, 'invalid canonical Vault string')
}

const memberVaultMetadataSchema = z.object({
  name: nfcString(256),
  description: nfcString(2_048).optional(),
  iconReference: nfcString(1_024).optional(),
  color: nfcString(32).optional(),
}).strict()

const memberIndexSchema = z.object({
  memberLabel: nfcString(256),
  entryType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  searchFields: z.array(nfcString(8_192)).max(16).refine(
    (values) => values.reduce((bytes, value) => bytes + encodeUtf8(value).length, 0) <= 8_192,
    'MemberIndex search fields exceed protocol limit',
  ),
  iconReference: nfcString(1_024).optional(),
}).strict()

const vaultKeyPackageSchema = z.object({
  protocolVersion: z.literal(VAULT_PROTOCOL_VERSION),
  organizationId: z.string(),
  vaultId: z.string(),
  memberId: z.string(),
  vkVersion: z.number().int().min(0).max(0xffffffff),
  memberKeyGeneration: z.number().int().min(0).max(0xffffffff),
  vaultKey: z.string(),
}).strict()

export type MemberVaultMetadata = z.infer<typeof memberVaultMetadataSchema>
export type DecryptedMemberIndex = z.infer<typeof memberIndexSchema>

export interface MemberVaultKeyEnvelope {
  protocolVersion: number
  algorithmSuite: number
  organizationId: string
  vaultId: string
  memberId: string
  vkVersion: number
  memberKeyGeneration: number
  recipientMemberKeyVersion: number
  recipientMemberKeyFingerprint: string
  sealedVaultKeyPackage: string
}

export interface MemberVaultKeyExpectation {
  organizationId: string
  vaultId: string
  memberId: string
  vkVersion: number
  memberKeyGeneration: number
}

export interface MemberVaultMetadataEnvelope extends VaultCiphertextEnvelope {
  organizationId: string
  vaultId: string
  metadataRevision: string
  header: VaultEnvelopeHeader
  ciphertext: string
}

export interface MemberIndexEnvelope extends VaultCiphertextEnvelope {
  organizationId: string
  vaultId: string
  entryId: string
  memberIndexRevision: string
  header: VaultEnvelopeHeader
  ciphertext: string
}

export interface VaultEntryKeyEnvelope extends VaultCiphertextEnvelope {
  organizationId: string
  vaultId: string
  entryId: string
  wrapperRevision: string
  keyVersion: number
  memberKeyGeneration: number
  wrappingKeyVersion: number
  header: VaultEnvelopeHeader
  wrappedEntryDekByVk: string
}

function decodeCanonicalJson(bytes: Uint8Array): unknown {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const parsed: unknown = JSON.parse(text)
  if (canonicalizeVaultJson(parsed as Parameters<typeof canonicalizeVaultJson>[0]) !== text) {
    throw new Error('Vault payload is not canonical JSON')
  }
  return parsed
}

async function memberKeyFingerprint(publicKey: Uint8Array): Promise<string> {
  const input = concatBytes(encodeUtf8('PLDNV2FP'), encodeU16(VAULT_PROTOCOL_VERSION), encodeU16(5), publicKey)
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(input).buffer)))
}

function assertMemberVaultKeyBindings(envelope: MemberVaultKeyEnvelope, expected: MemberVaultKeyExpectation): void {
  if (envelope.protocolVersion !== VAULT_PROTOCOL_VERSION || envelope.algorithmSuite !== 1) throw new Error('unsupported Member Vault key envelope')
  if (envelope.organizationId !== expected.organizationId || envelope.vaultId !== expected.vaultId || envelope.memberId !== expected.memberId) {
    throw new Error('Member Vault key scope mismatch')
  }
  if (envelope.vkVersion !== expected.vkVersion || envelope.memberKeyGeneration !== expected.memberKeyGeneration) {
    throw new Error('Member Vault key generation mismatch')
  }
}

export async function openMemberVaultKey(
  envelope: MemberVaultKeyEnvelope,
  expected: MemberVaultKeyExpectation,
  memberPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  if (memberPrivateKey.length !== 32) throw new Error('Member private key must be 32 bytes')
  assertMemberVaultKeyBindings(envelope, expected)
  const sodium = await loadSodium()
  const publicKey = sodium.crypto_scalarmult_base(memberPrivateKey)
  const expectedFingerprint = await memberKeyFingerprint(publicKey)
  if (envelope.recipientMemberKeyFingerprint !== expectedFingerprint) throw new Error('Member key fingerprint mismatch')
  const ciphertext = decodeBase64Url(envelope.sealedVaultKeyPackage, 4_144)
  const plaintext = await openVaultProtocolPackage(ciphertext, publicKey, memberPrivateKey)
  try {
    const payload = vaultKeyPackageSchema.parse(decodeCanonicalJson(plaintext))
    if (payload.organizationId !== expected.organizationId || payload.vaultId !== expected.vaultId || payload.memberId !== expected.memberId) {
      throw new Error('sealed Vault key scope mismatch')
    }
    if (payload.vkVersion !== expected.vkVersion || payload.memberKeyGeneration !== expected.memberKeyGeneration) {
      throw new Error('sealed Vault key generation mismatch')
    }
    return decodeBase64Url(payload.vaultKey, 32)
  } finally {
    wipe(plaintext)
  }
}

export async function decryptMemberVaultMetadata(
  envelope: MemberVaultMetadataEnvelope,
  trusted: { organizationId: string; vaultId: string; keyVersion: number; memberKeyGeneration: number },
  vaultKey: Uint8Array,
): Promise<MemberVaultMetadata> {
  const derivedKey = await deriveVaultProjectionKey({
    baseKey: vaultKey,
    purpose: 'member-vault-metadata',
    resourceKind: 1,
    organizationId: trusted.organizationId,
    vaultId: trusted.vaultId,
    keyVersion: trusted.keyVersion,
    memberKeyGeneration: trusted.memberKeyGeneration,
  })
  let plaintext: Uint8Array | undefined
  try {
    plaintext = await decryptVaultEnvelope('member-vault-metadata', envelope, derivedKey, {
      aadContext: {
        ...envelope,
        organizationId: trusted.organizationId,
        vaultId: trusted.vaultId,
        header: { ...envelope.header, keyVersion: trusted.keyVersion, memberKeyGeneration: trusted.memberKeyGeneration },
      },
      minimumMemberKeyGeneration: trusted.memberKeyGeneration,
    })
    return memberVaultMetadataSchema.parse(decodeCanonicalJson(plaintext))
  } finally {
    wipe(derivedKey)
    if (plaintext) wipe(plaintext)
  }
}

export async function decryptMemberIndex(
  envelope: MemberIndexEnvelope,
  entryKey: VaultEntryKeyEnvelope,
  trusted: {
    organizationId: string
    vaultId: string
    entryId: string
    memberIndexRevision: string
    keyVersion: number
    memberKeyGeneration: number
    wrappingKeyVersion: number
  },
  vaultKey: Uint8Array,
): Promise<DecryptedMemberIndex> {
  const entryDek = await decryptVaultEnvelope('entry-key-wrapper', entryKey, vaultKey, {
    aadContext: {
      ...entryKey,
      organizationId: trusted.organizationId,
      vaultId: trusted.vaultId,
      entryId: trusted.entryId,
      wrapperRevision: entryKey.wrapperRevision,
      keyVersion: trusted.keyVersion,
      memberKeyGeneration: trusted.memberKeyGeneration,
      wrappingKeyVersion: trusted.wrappingKeyVersion,
      header: {
        ...entryKey.header,
        resourceRevision: entryKey.wrapperRevision,
        keyVersion: trusted.keyVersion,
        memberKeyGeneration: trusted.memberKeyGeneration,
      },
    },
    minimumMemberKeyGeneration: trusted.memberKeyGeneration,
  })
  if (entryDek.length !== 32) {
    wipe(entryDek)
    throw new Error('EntryDEK must be 32 bytes')
  }
  let derivedKey: Uint8Array | undefined
  let plaintext: Uint8Array | undefined
  try {
    derivedKey = await deriveVaultProjectionKey({
      baseKey: entryDek,
      purpose: 'member-index',
      resourceKind: 2,
      organizationId: trusted.organizationId,
      vaultId: trusted.vaultId,
      entryId: trusted.entryId,
      keyVersion: trusted.keyVersion,
      memberKeyGeneration: trusted.memberKeyGeneration,
    })
    plaintext = await decryptVaultEnvelope('member-index', envelope, derivedKey, {
      aadContext: {
        ...envelope,
        organizationId: trusted.organizationId,
        vaultId: trusted.vaultId,
        entryId: trusted.entryId,
        memberIndexRevision: trusted.memberIndexRevision,
        header: {
          ...envelope.header,
          resourceRevision: trusted.memberIndexRevision,
          keyVersion: trusted.keyVersion,
          memberKeyGeneration: trusted.memberKeyGeneration,
        },
      },
      minimumMemberKeyGeneration: trusted.memberKeyGeneration,
    })
    return memberIndexSchema.parse(decodeCanonicalJson(plaintext))
  } finally {
    wipe(entryDek)
    if (derivedKey) wipe(derivedKey)
    if (plaintext) wipe(plaintext)
  }
}
