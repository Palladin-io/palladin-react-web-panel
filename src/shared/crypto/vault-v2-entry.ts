import { z } from 'zod'
import type { CustomField, EntryPlaintext } from '../../features/vaults/types'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT, type EntryType } from '../types/entry-type'
import { encodeUtf8 } from './vault-v2-bytes'
import { decryptVaultEnvelope, encryptVaultEnvelope, type VaultCiphertextEnvelope } from './vault-v2-envelope'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import type { VaultEnvelopeHeader } from './vault-v2-protocol'
import { canonicalizeVaultJson, type CanonicalJson } from './vault-v2-signatures'
import { randomBytes, wipe } from './sodium'

export const AGENT_FIELD_ACCESS = [
  'never',
  'discovery',
  'onGrantValue',
  'onGrantDerived',
  'onGrantRuntime',
] as const
export type AgentFieldAccess = (typeof AGENT_FIELD_ACCESS)[number]

export const ENTRY_FIELD = {
  agentLabel: 'agentLabel',
  description: 'description',
  value: 'value',
  username: 'username',
  password: 'password',
  url: 'url',
  urlDomain: 'urlDomain',
  notes: 'notes',
  totp: 'totp',
  interpreter: 'interpreter',
  script: 'script',
  refs: 'refs',
  cardholderName: 'cardholderName', cardNumber: 'cardNumber', expiryMonth: 'expiryMonth',
  expiryYear: 'expiryYear', securityCode: 'securityCode', pin: 'pin', billingAddress: 'billingAddress',
} as const

export interface AgentVisibilityPolicy {
  discoverable: boolean
  fields: Record<string, AgentFieldAccess>
}

const DISCOVERY_OR_NEVER = ['never', 'discovery'] as const
const VALUE_OR_NEVER = ['never', 'onGrantValue'] as const
const DERIVED_OR_NEVER = ['never', 'onGrantDerived'] as const
const RUNTIME_OR_NEVER = ['never', 'onGrantRuntime'] as const

export function allowedAgentFieldAccess(
  type: EntryType,
  fieldId: string,
  customFieldType?: CustomField['type'],
): readonly AgentFieldAccess[] {
  if (fieldId === ENTRY_FIELD.agentLabel || fieldId === ENTRY_FIELD.description) return DISCOVERY_OR_NEVER
  if (fieldId === ENTRY_FIELD.notes) return type === ENTRY_TYPE_SCRIPT || type === ENTRY_TYPE_CREDIT_CARD ? RUNTIME_OR_NEVER : VALUE_OR_NEVER
  if (fieldId === ENTRY_FIELD.totp || customFieldType === 'totp') return DERIVED_OR_NEVER
  if (fieldId.startsWith('custom:')) {
    return type === ENTRY_TYPE_SCRIPT || type === ENTRY_TYPE_CREDIT_CARD
      ? RUNTIME_OR_NEVER
      : ['never', 'discovery', 'onGrantValue'] as const
  }
  if (type === ENTRY_TYPE_KEY && fieldId === ENTRY_FIELD.value) return VALUE_OR_NEVER
  if (type === ENTRY_TYPE_CREDENTIAL) {
    if (fieldId === ENTRY_FIELD.username) return ['never', 'discovery', 'onGrantValue'] as const
    if (fieldId === ENTRY_FIELD.urlDomain) return DISCOVERY_OR_NEVER
    if (fieldId === ENTRY_FIELD.url || fieldId === ENTRY_FIELD.password) return VALUE_OR_NEVER
  }
  if (type === ENTRY_TYPE_SCRIPT) {
    if (fieldId === ENTRY_FIELD.interpreter) return DISCOVERY_OR_NEVER
    if (fieldId === ENTRY_FIELD.script || fieldId === ENTRY_FIELD.refs) return RUNTIME_OR_NEVER
  }
  if (type === ENTRY_TYPE_CREDIT_CARD) {
    if ([ENTRY_FIELD.cardholderName, ENTRY_FIELD.cardNumber, ENTRY_FIELD.expiryMonth, ENTRY_FIELD.expiryYear,
      ENTRY_FIELD.securityCode, ENTRY_FIELD.pin, ENTRY_FIELD.billingAddress].includes(fieldId as never)) return RUNTIME_OR_NEVER
  }
  return ['never'] as const
}

export interface CanonicalEntryDraft {
  memberLabel: string
  agentLabel: string
  description?: string
  iconReference?: string
  entryType: EntryType
  content: EntryPlaintext
  policy: AgentVisibilityPolicy
}

export interface MemberIndexPlaintext {
  memberLabel: string
  entryType: EntryType
  searchFields: string[]
  iconReference?: string
}

export interface MemberSecretPlaintext {
  schemaVersion: 1
  memberLabel: string
  agentLabel: string
  description?: string
  iconReference?: string
  entryType: EntryType
  content: EntryPlaintext
  agentVisibilityPolicy: AgentVisibilityPolicy
}

export interface AgentDiscoveryPlaintext {
  schemaVersion: 1
  agentLabel: string
  entryType: EntryType
  capabilities: string[]
  fields: Record<string, string>
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

export interface MemberSecretEnvelope extends VaultCiphertextEnvelope {
  organizationId: string
  vaultId: string
  entryId: string
  revision: string
  operation: 1 | 2 | 3 | 4 | 5
  header: VaultEnvelopeHeader
  ciphertext: string
}

export interface AgentDiscoveryEnvelope extends VaultCiphertextEnvelope {
  organizationId: string
  vaultId: string
  entryId: string
  agentDiscoveryRevision: string
  vdkVersion: number
  header: VaultEnvelopeHeader
  ciphertext: string
}

export interface InitialEntryMaterial {
  entryKey: VaultEntryKeyEnvelope
  memberIndex: import('./vault-v2-member-sync').MemberIndexEnvelope
  memberSecret: MemberSecretEnvelope
  agentDiscovery?: AgentDiscoveryEnvelope
}

export interface CanonicalEntryDetail {
  organizationId: string
  vaultId: string
  id: string
  currentRevision: string
  memberIndexRevision: string
  agentDiscoveryRevision?: string | null
  agentDiscoveryRevisionHighWatermark: string
  currentKeyVersion: number
  state: 'active' | 'archived' | 'deleted' | 1 | 2 | 3
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  memberIndex: import('./vault-v2-member-sync').MemberIndexEnvelope
  memberSecret: MemberSecretEnvelope
  agentDiscovery?: AgentDiscoveryEnvelope | null
  entryKey: VaultEntryKeyEnvelope
}

export interface EntryLifecycleMaterial {
  baseRevision: string
  memberSecret: MemberSecretEnvelope
  agentDiscovery?: AgentDiscoveryEnvelope
}

export interface EntryUpdateMaterial {
  baseRevision: string
  memberSecret: MemberSecretEnvelope
  memberIndex?: import('./vault-v2-member-sync').MemberIndexEnvelope
  agentDiscoveryChanged: boolean
  agentDiscovery?: AgentDiscoveryEnvelope
  grantEnvelopes: unknown[]
}

const policySchema = z.object({
  discoverable: z.boolean(),
  fields: z.record(z.string().min(1).max(128), z.enum(AGENT_FIELD_ACCESS)),
}).strict()

export function defaultAgentVisibilityPolicy(type: EntryType, fields: CustomField[] = []): AgentVisibilityPolicy {
  const defaults: Record<string, AgentFieldAccess> = {
    [ENTRY_FIELD.agentLabel]: 'discovery',
    [ENTRY_FIELD.description]: 'never',
    [ENTRY_FIELD.notes]: type === ENTRY_TYPE_SCRIPT || type === ENTRY_TYPE_CREDIT_CARD ? 'never' : 'onGrantValue',
  }
  if (type === ENTRY_TYPE_KEY) defaults[ENTRY_FIELD.value] = 'onGrantValue'
  if (type === ENTRY_TYPE_CREDENTIAL) {
    defaults[ENTRY_FIELD.username] = 'discovery'
    defaults[ENTRY_FIELD.urlDomain] = 'discovery'
    defaults[ENTRY_FIELD.url] = 'onGrantValue'
    defaults[ENTRY_FIELD.password] = 'onGrantValue'
    defaults[ENTRY_FIELD.totp] = 'onGrantDerived'
  }
  if (type === ENTRY_TYPE_SCRIPT) {
    defaults[ENTRY_FIELD.interpreter] = 'discovery'
    defaults[ENTRY_FIELD.script] = 'onGrantRuntime'
    defaults[ENTRY_FIELD.refs] = 'onGrantRuntime'
  }
  if (type === ENTRY_TYPE_CREDIT_CARD) {
    for (const id of [ENTRY_FIELD.cardholderName, ENTRY_FIELD.cardNumber, ENTRY_FIELD.expiryMonth,
      ENTRY_FIELD.expiryYear, ENTRY_FIELD.securityCode, ENTRY_FIELD.pin, ENTRY_FIELD.billingAddress]) {
      defaults[id] = 'onGrantRuntime'
    }
  }
  for (const field of fields) {
    defaults[`custom:${field.id}`] = field.type === 'totp'
      ? 'onGrantDerived'
      : type === ENTRY_TYPE_SCRIPT || type === ENTRY_TYPE_CREDIT_CARD ? 'onGrantRuntime' : 'onGrantValue'
  }
  return { discoverable: true, fields: defaults }
}

export function validateAgentVisibilityPolicy(
  type: EntryType,
  policy: AgentVisibilityPolicy,
  fields: CustomField[] = [],
): AgentVisibilityPolicy {
  const parsed = policySchema.parse(policy)
  const next = { discoverable: parsed.discoverable, fields: { ...parsed.fields } }
  if (next.discoverable && next.fields[ENTRY_FIELD.agentLabel] !== 'discovery') {
    throw new Error('A discoverable Entry requires an Agent-facing label')
  }
  const customTypes = new Map(fields.map((field) => [`custom:${field.id}`, field.type]))
  for (const [fieldId, access] of Object.entries(next.fields)) {
    if (!allowedAgentFieldAccess(type, fieldId, customTypes.get(fieldId)).includes(access)) {
      throw new Error(`Unsupported Agent access mode for ${fieldId}`)
    }
  }
  return next
}

export function buildEntryProjections(draft: CanonicalEntryDraft): {
  memberIndex: MemberIndexPlaintext
  memberSecret: MemberSecretPlaintext
  agentDiscovery?: AgentDiscoveryPlaintext
} {
  const customFields = draft.content.fields ?? []
  const policy = validateAgentVisibilityPolicy(draft.entryType, draft.policy, customFields)
  const memberSecret: MemberSecretPlaintext = {
    schemaVersion: 1,
    memberLabel: draft.memberLabel,
    agentLabel: draft.agentLabel,
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.iconReference ? { iconReference: draft.iconReference } : {}),
    entryType: draft.entryType,
    content: draft.content,
    agentVisibilityPolicy: policy,
  }
  const memberIndex: MemberIndexPlaintext = {
    memberLabel: draft.memberLabel,
    entryType: draft.entryType,
    searchFields: memberSearchFields(draft),
    ...(draft.iconReference ? { iconReference: draft.iconReference } : {}),
  }
  if (!policy.discoverable) return { memberIndex, memberSecret }

  const discoveryFields: Record<string, string> = {}
  const include = (id: string, value?: string) => {
    if (policy.fields[id] === 'discovery' && value) discoveryFields[id] = value
  }
  include(ENTRY_FIELD.description, draft.description)
  if (draft.content.type === ENTRY_TYPE_CREDENTIAL) {
    include(ENTRY_FIELD.username, draft.content.username)
    include(ENTRY_FIELD.urlDomain, domainFrom(draft.content.url))
  } else if (draft.content.type === ENTRY_TYPE_SCRIPT) {
    include(ENTRY_FIELD.interpreter, draft.content.interpreter)
  }
  for (const field of customFields) {
    if (field.type === 'totp' || typeof field.value !== 'string') continue
    include(`custom:${field.id}`, field.value)
  }
  const capabilities = ['get', 'exec', 'inject']
  return {
    memberIndex,
    memberSecret,
    agentDiscovery: {
      schemaVersion: 1,
      agentLabel: draft.agentLabel,
      entryType: draft.entryType,
      capabilities,
      fields: discoveryFields,
    },
  }
}

function memberSearchFields(draft: CanonicalEntryDraft): string[] {
  const values = [draft.memberLabel, draft.description]
  if (draft.content.type === ENTRY_TYPE_CREDENTIAL) values.push(draft.content.username, draft.content.url)
  if (draft.content.type === ENTRY_TYPE_SCRIPT) values.push(draft.content.interpreter)
  if (draft.content.type === ENTRY_TYPE_CREDIT_CARD) values.push(draft.content.cardholderName)
  for (const field of draft.content.fields ?? []) {
    if (field.type === 'concealed' || field.type === 'totp' || typeof field.value !== 'string') continue
    values.push(field.label, field.value)
  }
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].slice(0, 16)
}

function domainFrom(url?: string): string | undefined {
  if (!url) return undefined
  try { return new URL(url).hostname.toLowerCase() } catch { return undefined }
}

function canonicalBytes(value: CanonicalJson): Uint8Array {
  return encodeUtf8(canonicalizeVaultJson(value))
}

function decodeCanonicalJson(bytes: Uint8Array): unknown {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const parsed: unknown = JSON.parse(text)
  if (canonicalizeVaultJson(parsed as CanonicalJson) !== text) throw new Error('Vault payload is not canonical JSON')
  return parsed
}

async function openEntryDek(
  detail: CanonicalEntryDetail,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  const entryDek = await decryptVaultEnvelope('entry-key-wrapper', detail.entryKey, vaultKey, {
    aadContext: detail.entryKey,
    minimumMemberKeyGeneration: detail.entryKey.memberKeyGeneration,
  })
  if (entryDek.length !== 32) {
    wipe(entryDek)
    throw new Error('EntryDEK must be 32 bytes')
  }
  return entryDek
}

export async function decryptHistoricalMemberSecret(
  detail: Pick<CanonicalEntryDetail, 'organizationId' | 'vaultId' | 'id'>,
  memberSecret: MemberSecretEnvelope,
  entryKey: VaultEntryKeyEnvelope,
  vaultKey: Uint8Array,
): Promise<MemberSecretPlaintext> {
  if (entryKey.organizationId !== detail.organizationId || entryKey.vaultId !== detail.vaultId
    || entryKey.entryId !== detail.id || memberSecret.organizationId !== detail.organizationId
    || memberSecret.vaultId !== detail.vaultId || memberSecret.entryId !== detail.id
    || memberSecret.header.keyVersion !== entryKey.keyVersion) {
    throw new Error('Historical Entry envelope scope mismatch')
  }
  const entryDek = await decryptVaultEnvelope('entry-key-wrapper', entryKey, vaultKey, {
    aadContext: entryKey,
    minimumMemberKeyGeneration: entryKey.memberKeyGeneration,
  })
  let key: Uint8Array | undefined
  let plaintext: Uint8Array | undefined
  try {
    if (entryDek.length !== 32) throw new Error('EntryDEK must be 32 bytes')
    key = await deriveVaultProjectionKey({
      baseKey: entryDek,
      purpose: 'member-secret',
      resourceKind: 2,
      organizationId: detail.organizationId,
      vaultId: detail.vaultId,
      entryId: detail.id,
      keyVersion: entryKey.keyVersion,
      memberKeyGeneration: entryKey.memberKeyGeneration,
    })
    plaintext = await decryptVaultEnvelope('member-secret', memberSecret, key, {
      aadContext: memberSecret,
      minimumMemberKeyGeneration: entryKey.memberKeyGeneration,
    })
    const value = decodeCanonicalJson(plaintext) as MemberSecretPlaintext
    validateAgentVisibilityPolicy(value.entryType, value.agentVisibilityPolicy, value.content.fields ?? [])
    if (value.schemaVersion !== 1 || value.content.type !== value.entryType) throw new Error('Invalid MemberSecret payload')
    return value
  } finally {
    wipe(entryDek)
    if (key) wipe(key)
    if (plaintext) wipe(plaintext)
  }
}

export async function decryptMemberSecret(
  detail: CanonicalEntryDetail,
  vaultKey: Uint8Array,
): Promise<MemberSecretPlaintext> {
  const entryDek = await openEntryDek(detail, vaultKey)
  let key: Uint8Array | undefined
  let plaintext: Uint8Array | undefined
  try {
    key = await deriveVaultProjectionKey({
      baseKey: entryDek,
      purpose: 'member-secret',
      resourceKind: 2,
      organizationId: detail.organizationId,
      vaultId: detail.vaultId,
      entryId: detail.id,
      keyVersion: detail.currentKeyVersion,
      memberKeyGeneration: detail.entryKey.memberKeyGeneration,
    })
    plaintext = await decryptVaultEnvelope('member-secret', detail.memberSecret, key, {
      aadContext: detail.memberSecret,
      minimumMemberKeyGeneration: detail.entryKey.memberKeyGeneration,
    })
    const value = decodeCanonicalJson(plaintext) as MemberSecretPlaintext
    validateAgentVisibilityPolicy(value.entryType, value.agentVisibilityPolicy, value.content.fields ?? [])
    if (value.schemaVersion !== 1 || value.content.type !== value.entryType) throw new Error('Invalid MemberSecret payload')
    return value
  } finally {
    wipe(entryDek)
    if (key) wipe(key)
    if (plaintext) wipe(plaintext)
  }
}

export async function createEntryUpdateMaterial(
  detail: CanonicalEntryDetail,
  previous: MemberSecretPlaintext,
  draft: CanonicalEntryDraft,
  vaultKey: Uint8Array,
  vdkVersion: number,
  discoveryKey?: Uint8Array,
): Promise<EntryUpdateMaterial> {
  const projections = buildEntryProjections(draft)
  const previousProjections = buildEntryProjections({
    memberLabel: previous.memberLabel,
    agentLabel: previous.agentLabel,
    ...(previous.description ? { description: previous.description } : {}),
    ...(previous.iconReference ? { iconReference: previous.iconReference } : {}),
    entryType: previous.entryType,
    content: previous.content,
    policy: previous.agentVisibilityPolicy,
  })
  const memberIndexChanged = canonicalizeVaultJson(projections.memberIndex as unknown as CanonicalJson)
    !== canonicalizeVaultJson(previousProjections.memberIndex as unknown as CanonicalJson)
  const discoveryChanged = canonicalizeVaultJson((projections.agentDiscovery ?? null) as unknown as CanonicalJson)
    !== canonicalizeVaultJson((previousProjections.agentDiscovery ?? null) as unknown as CanonicalJson)
  if (discoveryChanged && projections.agentDiscovery && !discoveryKey) throw new Error('Discovery key is required')

  const revision = (BigInt(detail.currentRevision) + 1n).toString()
  const common = { organizationId: detail.organizationId, vaultId: detail.vaultId, entryId: detail.id }
  const entryDek = await openEntryDek(detail, vaultKey)
  let secretKey: Uint8Array | undefined
  let indexKey: Uint8Array | undefined
  let discoveryProjectionKey: Uint8Array | undefined
  let secretBytes: Uint8Array | undefined
  let indexBytes: Uint8Array | undefined
  let discoveryBytes: Uint8Array | undefined
  try {
    secretKey = await deriveVaultProjectionKey({ baseKey: entryDek, purpose: 'member-secret', resourceKind: 2,
      ...common, keyVersion: detail.currentKeyVersion, memberKeyGeneration: detail.entryKey.memberKeyGeneration })
    secretBytes = canonicalBytes(projections.memberSecret as unknown as CanonicalJson)
    const secretContext = { ...common, revision, operation: 2 as const,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 3,
        resourceRevision: revision, keyVersion: detail.currentKeyVersion,
        memberKeyGeneration: detail.entryKey.memberKeyGeneration, nonce: '' } }
    const encryptedSecret = await encryptVaultEnvelope('member-secret', secretContext, secretBytes, secretKey)
    const memberSecret: MemberSecretEnvelope = {
      ...secretContext,
      header: { ...secretContext.header, nonce: encryptedSecret.nonce },
      ciphertext: encryptedSecret.ciphertext,
    }

    let memberIndex: import('./vault-v2-member-sync').MemberIndexEnvelope | undefined
    if (memberIndexChanged) {
      indexKey = await deriveVaultProjectionKey({ baseKey: entryDek, purpose: 'member-index', resourceKind: 2,
        ...common, keyVersion: detail.currentKeyVersion, memberKeyGeneration: detail.entryKey.memberKeyGeneration })
      indexBytes = canonicalBytes(projections.memberIndex as unknown as CanonicalJson)
      const indexContext = { ...common, memberIndexRevision: revision,
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 2,
          resourceRevision: revision, keyVersion: detail.currentKeyVersion,
          memberKeyGeneration: detail.entryKey.memberKeyGeneration, nonce: '' } }
      const encrypted = await encryptVaultEnvelope('member-index', indexContext, indexBytes, indexKey)
      memberIndex = { ...indexContext, header: { ...indexContext.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
    }

    let agentDiscovery: AgentDiscoveryEnvelope | undefined
    if (discoveryChanged && projections.agentDiscovery && discoveryKey) {
      discoveryProjectionKey = await deriveVaultProjectionKey({ baseKey: discoveryKey, purpose: 'agent-discovery',
        resourceKind: 2, ...common, keyVersion: vdkVersion,
        memberKeyGeneration: detail.entryKey.memberKeyGeneration })
      discoveryBytes = canonicalBytes(projections.agentDiscovery as unknown as CanonicalJson)
      const discoveryRevision = revision
      const context = { ...common, agentDiscoveryRevision: discoveryRevision,
        vdkVersion,
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 4,
          resourceRevision: discoveryRevision, keyVersion: vdkVersion,
          memberKeyGeneration: detail.entryKey.memberKeyGeneration, nonce: '' } }
      const encrypted = await encryptVaultEnvelope('agent-discovery', context, discoveryBytes, discoveryProjectionKey)
      agentDiscovery = { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
    }
    return { baseRevision: detail.currentRevision, memberSecret, ...(memberIndex ? { memberIndex } : {}),
      agentDiscoveryChanged: discoveryChanged, ...(agentDiscovery ? { agentDiscovery } : {}), grantEnvelopes: [] }
  } finally {
    for (const value of [entryDek, secretKey, indexKey, discoveryProjectionKey, secretBytes, indexBytes, discoveryBytes]) {
      if (value) wipe(value)
    }
  }
}

export async function createEntryRestoreMaterial(
  detail: CanonicalEntryDetail,
  plaintext: MemberSecretPlaintext,
  vaultKey: Uint8Array,
  vdkVersion: number,
  discoveryKey: Uint8Array,
): Promise<EntryLifecycleMaterial> {
  if (detail.state !== 'archived' && detail.state !== 2
    && detail.state !== 'deleted' && detail.state !== 3) {
    throw new Error('Only an Archived or Deleted Entry can be restored here')
  }
  const projections = buildEntryProjections({
    memberLabel: plaintext.memberLabel,
    agentLabel: plaintext.agentLabel,
    ...(plaintext.description ? { description: plaintext.description } : {}),
    ...(plaintext.iconReference ? { iconReference: plaintext.iconReference } : {}),
    entryType: plaintext.entryType,
    content: plaintext.content,
    policy: plaintext.agentVisibilityPolicy,
  })
  const revision = (BigInt(detail.currentRevision) + 1n).toString()
  const common = { organizationId: detail.organizationId, vaultId: detail.vaultId, entryId: detail.id }
  const entryDek = await openEntryDek(detail, vaultKey)
  let secretKey: Uint8Array | undefined
  let discoveryProjectionKey: Uint8Array | undefined
  let secretBytes: Uint8Array | undefined
  let discoveryBytes: Uint8Array | undefined
  try {
    secretKey = await deriveVaultProjectionKey({ baseKey: entryDek, purpose: 'member-secret', resourceKind: 2,
      ...common, keyVersion: detail.currentKeyVersion, memberKeyGeneration: detail.entryKey.memberKeyGeneration })
    secretBytes = canonicalBytes(projections.memberSecret as unknown as CanonicalJson)
    const secretContext = { ...common, revision, operation: 4 as const,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 3,
        resourceRevision: revision, keyVersion: detail.currentKeyVersion,
        memberKeyGeneration: detail.entryKey.memberKeyGeneration, nonce: '' } }
    const encryptedSecret = await encryptVaultEnvelope('member-secret', secretContext, secretBytes, secretKey)
    const memberSecret: MemberSecretEnvelope = { ...secretContext,
      header: { ...secretContext.header, nonce: encryptedSecret.nonce }, ciphertext: encryptedSecret.ciphertext }

    let agentDiscovery: AgentDiscoveryEnvelope | undefined
    if (projections.agentDiscovery) {
      const discoveryRevision = (BigInt(detail.agentDiscoveryRevisionHighWatermark) + 1n).toString()
      discoveryProjectionKey = await deriveVaultProjectionKey({ baseKey: discoveryKey, purpose: 'agent-discovery',
        resourceKind: 2, ...common, keyVersion: vdkVersion,
        memberKeyGeneration: detail.entryKey.memberKeyGeneration })
      discoveryBytes = canonicalBytes(projections.agentDiscovery as unknown as CanonicalJson)
      const context = { ...common, agentDiscoveryRevision: discoveryRevision, vdkVersion,
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 4,
          resourceRevision: discoveryRevision, keyVersion: vdkVersion,
          memberKeyGeneration: detail.entryKey.memberKeyGeneration, nonce: '' } }
      const encrypted = await encryptVaultEnvelope('agent-discovery', context, discoveryBytes, discoveryProjectionKey)
      agentDiscovery = { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
    }
    return { baseRevision: detail.currentRevision, memberSecret, ...(agentDiscovery ? { agentDiscovery } : {}) }
  } finally {
    for (const value of [entryDek, secretKey, discoveryProjectionKey, secretBytes, discoveryBytes]) {
      if (value) wipe(value)
    }
  }
}

export async function createInitialEntryMaterial(
  draft: CanonicalEntryDraft,
  scope: {
    organizationId: string
    vaultId: string
    entryId: string
    vaultKeyVersion: number
    vdkVersion: number
    memberKeyGeneration: number
  },
  vaultKey: Uint8Array,
  discoveryKey: Uint8Array,
): Promise<InitialEntryMaterial> {
  const projections = buildEntryProjections(draft)
  const entryDek = await randomBytes(32)
  let memberIndexKey: Uint8Array | undefined
  let memberSecretKey: Uint8Array | undefined
  let agentDiscoveryKey: Uint8Array | undefined
  let memberIndexBytes: Uint8Array | undefined
  let memberSecretBytes: Uint8Array | undefined
  let discoveryBytes: Uint8Array | undefined
  try {
    const common = { organizationId: scope.organizationId, vaultId: scope.vaultId, entryId: scope.entryId }
    const entryKeyContext = {
      ...common,
      wrapperRevision: '1', keyVersion: 1, memberKeyGeneration: scope.memberKeyGeneration,
      wrappingKeyVersion: scope.vaultKeyVersion,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 8,
        resourceRevision: '1', keyVersion: 1, memberKeyGeneration: scope.memberKeyGeneration, nonce: '' },
    }
    const wrapped = await encryptVaultEnvelope('entry-key-wrapper', entryKeyContext, entryDek, vaultKey)
    memberIndexKey = await deriveVaultProjectionKey({ baseKey: entryDek, purpose: 'member-index', resourceKind: 2,
      ...common, keyVersion: 1, memberKeyGeneration: scope.memberKeyGeneration })
    memberSecretKey = await deriveVaultProjectionKey({ baseKey: entryDek, purpose: 'member-secret', resourceKind: 2,
      ...common, keyVersion: 1, memberKeyGeneration: scope.memberKeyGeneration })
    memberIndexBytes = canonicalBytes(projections.memberIndex as unknown as CanonicalJson)
    memberSecretBytes = canonicalBytes(projections.memberSecret as unknown as CanonicalJson)
    const memberIndexContext = { ...common, memberIndexRevision: '1',
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 2,
        resourceRevision: '1', keyVersion: 1, memberKeyGeneration: scope.memberKeyGeneration, nonce: '' } }
    const memberSecretContext = { ...common, revision: '1', operation: 1 as const,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 3,
        resourceRevision: '1', keyVersion: 1, memberKeyGeneration: scope.memberKeyGeneration, nonce: '' } }
    const [memberIndexEncrypted, memberSecretEncrypted] = await Promise.all([
      encryptVaultEnvelope('member-index', memberIndexContext, memberIndexBytes, memberIndexKey),
      encryptVaultEnvelope('member-secret', memberSecretContext, memberSecretBytes, memberSecretKey),
    ])
    let agentDiscovery: AgentDiscoveryEnvelope | undefined
    if (projections.agentDiscovery) {
      agentDiscoveryKey = await deriveVaultProjectionKey({ baseKey: discoveryKey, purpose: 'agent-discovery', resourceKind: 2,
        ...common, keyVersion: scope.vdkVersion, memberKeyGeneration: scope.memberKeyGeneration })
      discoveryBytes = canonicalBytes(projections.agentDiscovery as unknown as CanonicalJson)
      const context = { ...common, agentDiscoveryRevision: '1', vdkVersion: scope.vdkVersion,
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 4,
          resourceRevision: '1', keyVersion: scope.vdkVersion, memberKeyGeneration: scope.memberKeyGeneration, nonce: '' } }
      const encrypted = await encryptVaultEnvelope('agent-discovery', context, discoveryBytes, agentDiscoveryKey)
      agentDiscovery = { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
    }
    return {
      entryKey: { ...entryKeyContext, header: { ...entryKeyContext.header, nonce: wrapped.nonce }, wrappedEntryDekByVk: wrapped.ciphertext },
      memberIndex: { ...memberIndexContext, header: { ...memberIndexContext.header, nonce: memberIndexEncrypted.nonce }, ciphertext: memberIndexEncrypted.ciphertext },
      memberSecret: { ...memberSecretContext, header: { ...memberSecretContext.header, nonce: memberSecretEncrypted.nonce }, ciphertext: memberSecretEncrypted.ciphertext },
      ...(agentDiscovery ? { agentDiscovery } : {}),
    }
  } finally {
    for (const value of [entryDek, memberIndexKey, memberSecretKey, agentDiscoveryKey,
      memberIndexBytes, memberSecretBytes, discoveryBytes]) if (value) wipe(value)
  }
}
