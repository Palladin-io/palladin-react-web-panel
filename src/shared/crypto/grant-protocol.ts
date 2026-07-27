import { computeFieldSetCommitment, encodeCanonicalEnvelopeAad } from './canonical-aad'
import { VAULT_XCHACHA20_POLY1305_V1 } from './crypto-suite'
import { ENVELOPE_PURPOSE } from './envelope'
import { fromBase64, toBase64Url } from './encoding'
import { randomBytes, wipe } from './sodium'
import { encodeGrantPayload, projectGrantPayload, type MemberSecretV1 } from './vault-plaintext'
import { sealVaultEnvelope, toEnvelopeDescriptor, type EnvelopeDescriptorContract } from './vault-envelope'
import { computeVaultKeyFingerprint, sealKeyToX25519Recipient, VAULT_KEY_KIND, WRAPPER_PURPOSE, X25519_SEALED_BOX_V1 } from './x25519-wrapper'

export interface BuildGrantEnvelopeInput {
  organizationId: string; vaultId: string; entryId: string; grantId: string; agentId: string
  entryRevision: string; memberKeyGeneration: number; agentPublicKey: string; recipientKeyVersion: number
  approvedMethods: number; expiresAt?: string; remainingUses?: number; secret: MemberSecretV1
}

function instant(value?: string): { seconds: bigint; nanoseconds: number } | undefined {
  if (!value) return undefined
  const millis = Date.parse(value)
  if (!Number.isFinite(millis)) throw new TypeError('Invalid grant expiry')
  return { seconds: BigInt(Math.floor(millis / 1000)), nanoseconds: (millis % 1000) * 1_000_000 }
}

export async function buildCanonicalGrantEnvelope(input: BuildGrantEnvelopeInput) {
  const fieldIds = Object.entries(input.secret.agentFieldAccess)
    .filter(([, access]) => access === 'onGrantValue' || access === 'onGrantDerived' || access === 'onGrantRuntime')
    .map(([id]) => id).sort()
  const payload = projectGrantPayload(input.secret, fieldIds)
  const publicKey = fromBase64(input.agentPublicKey)
  const fingerprint = await computeVaultKeyFingerprint(publicKey, VAULT_KEY_KIND.agentX25519)
  const commitment = await computeFieldSetCommitment(fieldIds)
  const expiresAt = instant(input.expiresAt)
  const binding = {
    entryRevision: input.entryRevision, wrapperSuiteId: X25519_SEALED_BOX_V1,
    recipientKeyVersion: input.recipientKeyVersion, recipientKeyFingerprint: toBase64Url(fingerprint),
    approvedMethods: input.approvedMethods, fieldSetCommitment: toBase64Url(commitment),
    expiresAt: input.expiresAt ?? null, remainingUses: input.remainingUses ?? null,
  }
  const descriptor: EnvelopeDescriptorContract<typeof binding> = {
    protocolVersion: 2, cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1, purpose: ENVELOPE_PURPOSE.grant,
    scope: { organizationId: input.organizationId, vaultId: input.vaultId, entryId: input.entryId, grantOrRequestId: input.grantId, agentId: input.agentId },
    resourceRevision: '1', keyVersion: 1, memberKeyGeneration: input.memberKeyGeneration, binding,
  }
  const extension = {
    entryRevision: BigInt(input.entryRevision), wrapperSuiteId: X25519_SEALED_BOX_V1,
    recipientKeyVersion: input.recipientKeyVersion, recipientKeyFingerprint: fingerprint,
    methods: input.approvedMethods, fieldSetCommitment: commitment, expiresAt,
    remainingUses: input.remainingUses,
  }
  const dek = await randomBytes(32)
  const plaintext = encodeGrantPayload(payload)
  try {
    const envelope = await sealVaultEnvelope(descriptor, plaintext, dek, extension)
    const descriptorBytes = encodeCanonicalEnvelopeAad(toEnvelopeDescriptor(descriptor), extension)
    const descriptorCopy = new Uint8Array(descriptorBytes)
    const parentHash = new Uint8Array(await crypto.subtle.digest('SHA-256', descriptorCopy.buffer))
    try {
      const wrapperContext = {
        protocolVersion: 2, wrapperSuiteId: X25519_SEALED_BOX_V1, purpose: WRAPPER_PURPOSE.grantDek,
        organizationId: input.organizationId, vaultId: input.vaultId, entryId: input.entryId,
        grantOrRequestId: input.grantId, agentId: input.agentId, resourceRevision: 1,
        wrappedKeyVersion: 1, memberKeyGeneration: input.memberKeyGeneration,
        recipientKeyKind: VAULT_KEY_KIND.agentX25519, recipientKeyVersion: input.recipientKeyVersion,
        recipientFingerprint: fingerprint, parentDescriptorHash: parentHash,
      } as const
      const sealed = await sealKeyToX25519Recipient(dek, publicKey, wrapperContext)
      return {
        ...envelope,
        wrappedGrantDek: { descriptor: {
          protocolVersion: 2, wrapperSuiteId: X25519_SEALED_BOX_V1, purpose: WRAPPER_PURPOSE.grantDek,
          scope: descriptor.scope, resourceRevision: '1', wrappedKeyVersion: 1,
          memberKeyGeneration: input.memberKeyGeneration, recipientKeyKind: VAULT_KEY_KIND.agentX25519,
          recipientKeyVersion: input.recipientKeyVersion, recipientFingerprint: toBase64Url(fingerprint),
          parentDescriptorHash: toBase64Url(parentHash),
        }, encodedSealedKeyPackage: toBase64Url(sealed) }, fieldIds,
      }
    } finally { wipe(parentHash); wipe(descriptorCopy) }
  } finally { wipe(dek); plaintext.fill(0); wipe(publicKey); wipe(fingerprint); wipe(commitment) }
}
