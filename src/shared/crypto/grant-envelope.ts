import type { EntryPlaintext } from '../../features/vaults/types'
import {
  ENTRY_FIELD,
  validateAgentVisibilityPolicy,
  type AgentFieldAccess,
  type MemberSecretPlaintext,
} from './vault-v2-entry'
import { encodeBase64Url, encodeUtf8 } from './vault-v2-bytes'
import { encryptVaultEnvelope, sealVaultProtocolPackage } from './vault-v2-envelope'
import type { VaultEnvelopeHeader } from './vault-v2-protocol'
import { vaultKeyFingerprint } from './vault-v2-rotation'
import { canonicalizeVaultJson, type CanonicalJson } from './vault-v2-signatures'
import { fromBase64 } from './encoding'
import { randomBytes, wipe } from './sodium'

type GrantFieldAccess = Extract<AgentFieldAccess, 'onGrantValue' | 'onGrantDerived' | 'onGrantRuntime'>

export interface GrantPayloadField {
  access: GrantFieldAccess
  value: CanonicalJson
}

export interface GrantPayload {
  schemaVersion: 1
  entryType: MemberSecretPlaintext['entryType']
  fields: Record<string, GrantPayloadField>
}

export interface GrantableField {
  id: string
  label: string
  access: GrantFieldAccess
}

export function listGrantableFields(memberSecret: MemberSecretPlaintext): GrantableField[] {
  const policy = validateAgentVisibilityPolicy(
    memberSecret.entryType,
    memberSecret.agentVisibilityPolicy,
    memberSecret.content.fields ?? [],
  )
  const customLabels = new Map<string, string>((memberSecret.content.fields ?? [])
    .map((field) => [`custom:${field.id}`, field.label] as const))
  const fields: GrantableField[] = []
  for (const [id, access] of Object.entries(policy.fields)) {
    if (access === 'onGrantValue' || access === 'onGrantDerived' || access === 'onGrantRuntime') {
      fields.push({ id, access, label: customLabels.get(id) ?? id })
    }
  }
  return fields.sort((left, right) => left.label.localeCompare(right.label))
}

/** Complete protocol-2 envelope accepted by Vault's revision-bound grant endpoints. */
export interface GrantEntryEnvelope {
  organizationId: string
  vaultId: string
  grantId: string
  entryId: string
  grantEnvelopeRevision: string
  entryRevision: string
  protocolVersion: 2
  algorithmSuite: 1
  grantKeyVersion: number
  memberKeyGeneration: number
  recipientAgentKeyVersion: number
  ciphertext: string
  nonce: string
  agentWrappedGrantDek: string
  agentWrapperSuite: 1
  agentKeyFingerprint: string
  fieldIds: string[]
  expiresAt?: string
  remainingUses?: number
}

export interface ProduceGrantEntryEnvelopeParams {
  memberSecret: MemberSecretPlaintext
  scope: {
    organizationId: string
    vaultId: string
    grantId: string
    agentId: string
    entryId: string
    entryRevision: string
    grantEnvelopeRevision: string
    grantKeyVersion: number
    memberKeyGeneration: number
    recipientAgentKeyVersion: number
    approvedMethods: number
    expiresAt?: string
    remainingUses?: number
  }
  agentPublicKey: string
  /** Optional narrowing. Omitting it includes every policy-approved grant field. */
  fieldIds?: readonly string[]
  /** Refresh-only: silently remove fields the new policy no longer permits; never adds fields. */
  narrowToPolicy?: boolean
}

function grantValues(content: EntryPlaintext): Record<string, CanonicalJson | undefined> {
  const values: Record<string, CanonicalJson | undefined> = {}
  if (content.type === 0) values[ENTRY_FIELD.value] = content.value
  if (content.type === 1) {
    values[ENTRY_FIELD.username] = content.username
    values[ENTRY_FIELD.password] = content.password
    values[ENTRY_FIELD.url] = content.url
    values[ENTRY_FIELD.totp] = content.totp
  }
  if (content.type === 2) {
    values[ENTRY_FIELD.interpreter] = content.interpreter
    values[ENTRY_FIELD.script] = content.script
    values[ENTRY_FIELD.refs] = content.refs as unknown as CanonicalJson | undefined
  }
  if (content.type === 3) {
    values[ENTRY_FIELD.cardholderName] = content.cardholderName
    values[ENTRY_FIELD.cardNumber] = content.cardNumber
    values[ENTRY_FIELD.expiryMonth] = content.expiryMonth
    values[ENTRY_FIELD.expiryYear] = content.expiryYear
    values[ENTRY_FIELD.billingAddress] = content.billingAddress
  }
  values[ENTRY_FIELD.notes] = content.notes
  for (const field of content.fields ?? []) values[`custom:${field.id}`] = field.value as CanonicalJson
  return values
}

export function buildGrantPayload(
  memberSecret: MemberSecretPlaintext,
  selectedFieldIds?: readonly string[],
): { payload: GrantPayload; fieldIds: string[] } {
  const policy = validateAgentVisibilityPolicy(
    memberSecret.entryType,
    memberSecret.agentVisibilityPolicy,
    memberSecret.content.fields ?? [],
  )
  const allowed = new Set(Object.entries(policy.fields)
    .filter(([, access]) => access === 'onGrantValue' || access === 'onGrantDerived' || access === 'onGrantRuntime')
    .map(([fieldId]) => fieldId))
  const selected = selectedFieldIds ? [...new Set(selectedFieldIds)] : [...allowed]
  if (selected.some((fieldId) => !allowed.has(fieldId))) throw new Error('Grant field scope exceeds Agent Visibility Policy')
  const values = grantValues(memberSecret.content)
  const fields: Record<string, GrantPayloadField> = {}
  for (const fieldId of selected.sort()) {
    const value = values[fieldId]
    if (value === undefined) continue
    fields[fieldId] = { access: policy.fields[fieldId] as GrantFieldAccess, value }
  }
  const fieldIds = Object.keys(fields)
  if (fieldIds.length === 0) throw new Error('Grant payload contains no approved fields')
  return { payload: { schemaVersion: 1, entryType: memberSecret.entryType, fields }, fieldIds }
}

/**
 * Produces one filtered, revision-bound GrantPayload. GrantDEK is fresh per envelope and sealed to
 * the concrete Agent identity; VK and EntryDEK are never disclosed. All plaintext/key buffers are
 * wiped before returning.
 */
export async function produceGrantEntryEnvelope({
  memberSecret,
  scope,
  agentPublicKey,
  fieldIds: selectedFieldIds,
  narrowToPolicy = false,
}: ProduceGrantEntryEnvelopeParams): Promise<GrantEntryEnvelope> {
  const agentKey = fromBase64(agentPublicKey)
  if (agentKey.length !== 32) throw new Error('Agent X25519 public key must be 32 bytes')
  const fingerprint = await vaultKeyFingerprint(agentKey, 1)
  const effectiveFieldIds = narrowToPolicy && selectedFieldIds
    ? selectedFieldIds.filter((fieldId) => {
      const access = memberSecret.agentVisibilityPolicy.fields[fieldId]
      return access === 'onGrantValue' || access === 'onGrantDerived' || access === 'onGrantRuntime'
    })
    : selectedFieldIds
  const { payload, fieldIds } = buildGrantPayload(memberSecret, effectiveFieldIds)
  const plaintext = encodeUtf8(canonicalizeVaultJson(payload as unknown as CanonicalJson))
  const grantDek = await randomBytes(32)
  const header: VaultEnvelopeHeader = {
    protocolVersion: 2,
    algorithmSuite: 1,
    resourceKind: 4,
    projectionKind: 6,
    resourceRevision: scope.grantEnvelopeRevision,
    keyVersion: scope.grantKeyVersion,
    memberKeyGeneration: scope.memberKeyGeneration,
    nonce: '',
  }
  const context = {
    organizationId: scope.organizationId,
    vaultId: scope.vaultId,
    entryId: scope.entryId,
    grantId: scope.grantId,
    agentId: scope.agentId,
    grantEnvelopeRevision: scope.grantEnvelopeRevision,
    entryRevision: scope.entryRevision,
    grantKeyVersion: scope.grantKeyVersion,
    approvedMethods: scope.approvedMethods,
    ...(scope.expiresAt ? { expiresAt: scope.expiresAt } : {}),
    ...(scope.remainingUses !== undefined ? { useLimit: scope.remainingUses } : {}),
    recipientAgentKeyVersion: scope.recipientAgentKeyVersion,
    recipientAgentKeyFingerprint: fingerprint,
    header,
  }
  try {
    const encrypted = await encryptVaultEnvelope('grant-payload', context, plaintext, grantDek)
    const wrapped = await sealVaultProtocolPackage(grantDek, agentKey)
    return {
      organizationId: scope.organizationId,
      vaultId: scope.vaultId,
      grantId: scope.grantId,
      entryId: scope.entryId,
      grantEnvelopeRevision: scope.grantEnvelopeRevision,
      entryRevision: scope.entryRevision,
      protocolVersion: 2,
      algorithmSuite: 1,
      grantKeyVersion: scope.grantKeyVersion,
      memberKeyGeneration: scope.memberKeyGeneration,
      recipientAgentKeyVersion: scope.recipientAgentKeyVersion,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      agentWrappedGrantDek: encodeBase64Url(wrapped),
      agentWrapperSuite: 1,
      agentKeyFingerprint: fingerprint,
      fieldIds,
      ...(scope.expiresAt ? { expiresAt: scope.expiresAt } : {}),
      ...(scope.remainingUses !== undefined ? { remainingUses: scope.remainingUses } : {}),
    }
  } finally {
    wipe(plaintext)
    wipe(grantDek)
    wipe(agentKey)
  }
}
