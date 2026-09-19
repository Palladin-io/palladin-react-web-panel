import { isTotpField, type CustomField, type EntryPlaintext, type ScriptRef } from '../../features/vaults/types'
import { defaultCredentialAgentFieldAccess } from '@palladin/crypto'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY, type EntryType } from '../types/entry-type'
import { formatOtpauthUri, parseOtpauthUri } from './totp'
import {
  parsePublicAssetIconReference,
  publicAssetIconReference,
  type AgentFieldAccess,
  type MemberSecretV1,
} from './vault-plaintext'

export interface AgentVisibilityPolicy {
  discoverable: boolean
  fields: Record<string, AgentFieldAccess>
}

export interface EntryDraft {
  memberLabel: string; agentLabel: string; description?: string; iconReference?: string; color?: string
  entryType: EntryType; content: EntryPlaintext; policy: AgentVisibilityPolicy
}

export interface MemberSecretView {
  memberLabel: string; agentLabel: string; description?: string; iconReference?: string; color?: string
  entryType: EntryType; content: EntryPlaintext; agentVisibilityPolicy: AgentVisibilityPolicy
}

export type { AgentFieldAccess }

const DISCOVERY_OR_NEVER = ['never', 'discovery'] as const
const VALUE_OR_NEVER = ['never', 'onGrantValue'] as const
const RUNTIME_OR_NEVER = ['never', 'onGrantRuntime'] as const

export function allowedAgentFieldAccess(type: EntryType, fieldId: string, customType?: CustomField['type']): readonly AgentFieldAccess[] {
  if (fieldId === ENTRY_FIELD.agentLabel || fieldId === ENTRY_FIELD.description) return DISCOVERY_OR_NEVER
  if (type === ENTRY_TYPE_CREDIT_CARD) return ['never']
  if (fieldId === ENTRY_FIELD.notes) return type === 2 ? RUNTIME_OR_NEVER : VALUE_OR_NEVER
  if (fieldId === ENTRY_FIELD.totp || customType === 'totp') return ['never', 'onGrantDerived']
  if (fieldId.startsWith('custom:')) return type === 2 ? RUNTIME_OR_NEVER : ['never', 'discovery', 'onGrantValue']
  if (type === ENTRY_TYPE_KEY && fieldId === ENTRY_FIELD.value) return VALUE_OR_NEVER
  if (type === ENTRY_TYPE_CREDENTIAL) {
    if (fieldId === ENTRY_FIELD.username) return ['never', 'discovery', 'onGrantValue']
    if (fieldId === ENTRY_FIELD.urlDomain) return DISCOVERY_OR_NEVER
    if (fieldId === ENTRY_FIELD.url || fieldId === ENTRY_FIELD.password) return VALUE_OR_NEVER
  }
  if (type === 2) {
    if (fieldId === ENTRY_FIELD.interpreter) return DISCOVERY_OR_NEVER
    if (fieldId === ENTRY_FIELD.script || fieldId === ENTRY_FIELD.refs) return RUNTIME_OR_NEVER
  }
  return ['never']
}

export function defaultAgentVisibilityPolicy(type: EntryType, fields: CustomField[] = []): AgentVisibilityPolicy {
  if (type === ENTRY_TYPE_CREDENTIAL) {
    const defaults = defaultCredentialAgentFieldAccess(fields)
    const policy: AgentVisibilityPolicy = { discoverable: true, fields: {} }
    for (const [id, access] of Object.entries(defaults)) {
      if (['memberLabel', 'entryType', 'icon', 'color'].includes(id)) continue
      policy.fields[id.replace(/^credential\./, '')] = access
    }
    return policy
  }
  const policy: AgentVisibilityPolicy = { discoverable: true, fields: {
    agentLabel: 'discovery', description: type === 2 ? 'discovery' : 'never',
    notes: type === 2 || type === ENTRY_TYPE_CREDIT_CARD ? 'never' : 'onGrantValue',
  } }
  if (type === ENTRY_TYPE_KEY) Object.assign(policy.fields, {
    value: 'onGrantValue', url: 'onGrantValue',
  })
  else if (type === ENTRY_TYPE_CREDIT_CARD) Object.assign(policy.fields, {
    cardholderName: 'never', cardNumber: 'never', expiryMonth: 'never',
    expiryYear: 'never', billingAddress: 'never',
  })
  else Object.assign(policy.fields, { interpreter: 'discovery', script: 'onGrantRuntime', refs: 'onGrantRuntime' })
  for (const field of fields) policy.fields[`custom:${field.id}`] = field.type === 'totp'
    ? type === ENTRY_TYPE_CREDIT_CARD ? 'never' : 'onGrantDerived'
    : type === ENTRY_TYPE_CREDIT_CARD ? 'never' : type === 2 ? 'onGrantRuntime' : 'onGrantValue'
  return policy
}

export const ENTRY_FIELD = {
  agentLabel: 'agentLabel', description: 'description', value: 'value', username: 'username',
  password: 'password', url: 'url', urlDomain: 'urlDomain', notes: 'notes', totp: 'totp',
  interpreter: 'interpreter', script: 'script', refs: 'refs',
  cardholderName: 'cardholderName', cardNumber: 'cardNumber', expiryMonth: 'expiryMonth',
  expiryYear: 'expiryYear', billingAddress: 'billingAddress',
} as const

const FIELD_ID: Record<string, string> = {
  value: 'key.value', username: 'credential.username', password: 'credential.password',
  url: 'credential.url', urlDomain: 'credential.urlDomain', totp: 'credential.totp',
  notes: 'notes',
  interpreter: 'script.interpreter', script: 'script.source', refs: 'script.refs',
  cardholderName: 'creditCard.cardholderName', cardNumber: 'creditCard.cardNumber',
  expiryMonth: 'creditCard.expiryMonth', expiryYear: 'creditCard.expiryYear',
  billingAddress: 'creditCard.billingAddress',
}

function customFields(fields: CustomField[] | undefined) {
  return (fields ?? []).map((field) => ({
    id: field.id.startsWith('custom:') ? field.id : `custom:${field.id}`,
    label: field.label.normalize('NFC'), type: field.type.normalize('NFC'),
    value: isTotpField(field)
      ? Object.fromEntries(Object.entries(field.value).filter(([, value]) => value !== undefined))
      : field.value,
  }))
}

function fieldPolicy(
  type: EntryType,
  policy: AgentVisibilityPolicy,
  payload: EntryPlaintext,
): Record<string, AgentFieldAccess> {
  const mapped: Record<string, AgentFieldAccess> = {
    memberLabel: 'never', agentLabel: policy.discoverable ? 'discovery' : 'never',
    description: policy.fields.description ?? 'never', icon: 'never', color: 'never',
    entryType: policy.discoverable ? 'discovery' : 'never', notes: policy.fields.notes ?? 'never',
  }
  for (const [id, access] of Object.entries(policy.fields)) {
    if (type === ENTRY_TYPE_KEY && id === 'url'
      && (payload.type !== ENTRY_TYPE_KEY || !payload.url)) continue
    const canonicalId = type === ENTRY_TYPE_KEY && id === 'url' ? 'key.url' : FIELD_ID[id] ?? id
    mapped[canonicalId] = access
  }
  for (const field of payload.fields ?? []) {
    const id = field.id.startsWith('custom:') ? field.id : `custom:${field.id}`
    mapped[id] = policy.fields[id] ?? policy.fields[`custom:${field.id}`] ?? 'never'
  }
  if (type === ENTRY_TYPE_KEY) {
    mapped['key.value'] ??= 'never'
    if (payload.type === ENTRY_TYPE_KEY && payload.url) mapped['key.url'] ??= 'never'
  }
  else if (type === ENTRY_TYPE_CREDENTIAL) {
    for (const id of ['credential.username', 'credential.password', 'credential.url', 'credential.urlDomain', 'credential.totp']) mapped[id] ??= 'never'
  } else if (type === ENTRY_TYPE_CREDIT_CARD) {
    for (const id of ['creditCard.cardholderName', 'creditCard.cardNumber', 'creditCard.expiryMonth',
      'creditCard.expiryYear', 'creditCard.billingAddress']) mapped[id] ??= 'never'
  } else {
    for (const id of ['script.source', 'script.interpreter', 'script.refs']) mapped[id] ??= 'never'
  }
  return mapped
}

function domain(url?: string): string | null {
  if (!url) return null
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

function refFieldId(ref: ScriptRef): string {
  return FIELD_ID[ref.field] ?? (ref.field.startsWith('custom:') ? ref.field : `custom:${ref.field}`)
}

function canonicalTotp(uri: string | undefined) {
  if (!uri) return null
  const parsed = parseOtpauthUri(uri)
  if (!parsed || (parsed.digits !== 6 && parsed.digits !== 8)) throw new Error('TOTP must use 6 or 8 digits')
  return { ...parsed, digits: parsed.digits, issuer: parsed.issuer ?? null, account: parsed.account ?? null } as const
}

const LEGACY_FIELD_ID = Object.fromEntries(Object.entries(FIELD_ID).map(([legacy, canonical]) => [canonical, legacy]))

function legacyPolicy(secret: MemberSecretV1): AgentVisibilityPolicy {
  return {
    discoverable: secret.discoverable,
    fields: Object.fromEntries(Object.entries(secret.agentFieldAccess)
      .filter(([id]) => id !== 'memberLabel' && id !== 'icon' && id !== 'color' && id !== 'entryType')
      .map(([id, access]) => [LEGACY_FIELD_ID[id] ?? id, access])),
  }
}

function legacyCustomFields(secret: MemberSecretV1): CustomField[] {
  return secret.content.customFields.map((field) => ({
    id: field.id.replace(/^custom:/, ''), label: field.label, type: field.type,
    value: field.value as CustomField['value'],
  }))
}

function totpUri(value: Extract<MemberSecretV1, { entryType: 'credential' }>['content']['totp']): string | undefined {
  return value ? formatOtpauthUri(value) : undefined
}

/** New TOTP fields inherit the Credential default; existing restrictions remain authoritative. */
export function withNewCredentialTotpPolicy(
  previous: CustomField[], next: CustomField[], policy: AgentVisibilityPolicy,
): AgentVisibilityPolicy {
  const existing = new Set(previous.map((field) => field.id))
  const defaults = defaultCredentialAgentFieldAccess(next)
  const fields = { ...policy.fields }
  for (const field of next) {
    if (field.type !== 'totp' || existing.has(field.id)) continue
    const id = field.id.startsWith('custom:') ? field.id : `custom:${field.id}`
    fields[id] ??= defaults[id]
  }
  return { ...policy, fields }
}

export function fromMemberSecret(secret: MemberSecretV1): MemberSecretView {
  const common = {
    memberLabel: secret.memberLabel, agentLabel: secret.agentLabel ?? '',
    ...(secret.description ? { description: secret.description } : {}),
    ...(secret.icon ? { iconReference: secret.icon.kind === 'glyph'
      ? `builtin:${secret.icon.value}`
      : secret.icon.kind === 'encryptedAsset'
        ? `vault-asset:${secret.icon.assetId}`
        : secret.icon.kind === 'publicAsset'
          ? publicAssetIconReference(secret.icon)
          : undefined } : {}),
    ...(secret.color ? { color: secret.color } : {}),
    agentVisibilityPolicy: legacyPolicy(secret),
  }
  const fields = legacyCustomFields(secret)
  if (secret.entryType === 'key') return {
    ...common, entryType: ENTRY_TYPE_KEY,
    content: {
      type: ENTRY_TYPE_KEY, value: secret.content.value,
      url: secret.content.url ?? undefined, notes: secret.content.notes ?? undefined, fields,
    },
  }
  if (secret.entryType === 'credential') return {
    ...common, entryType: ENTRY_TYPE_CREDENTIAL,
    content: {
      type: ENTRY_TYPE_CREDENTIAL, username: secret.content.username, password: secret.content.password,
      url: secret.content.url ?? undefined, totp: totpUri(secret.content.totp),
      notes: secret.content.notes ?? undefined, fields,
    },
  }
  if (secret.entryType === 'creditCard') return {
    ...common, entryType: ENTRY_TYPE_CREDIT_CARD,
    content: { type: ENTRY_TYPE_CREDIT_CARD, cardholderName: secret.content.cardholderName,
      cardNumber: secret.content.cardNumber, expiryMonth: secret.content.expiryMonth,
      expiryYear: secret.content.expiryYear, billingAddress: secret.content.billingAddress ?? undefined,
      notes: secret.content.notes ?? undefined, fields },
  }
  return {
    ...common, entryType: 2,
    content: {
      type: 2, script: secret.content.source, interpreter: secret.content.interpreter,
      ...(secret.content.execution ? { execution: secret.content.execution } : {}),
      refs: secret.content.refs.map((ref) => ({
        env: ref.env, vaultId: ref.vaultId, entryId: ref.entryId,
        field: LEGACY_FIELD_ID[ref.fieldId] ?? ref.fieldId.replace(/^custom:/, ''),
      })),
      notes: secret.content.notes ?? undefined, fields,
    },
  }
}

export function toMemberSecret(input: {
  label: string; agentLabel: string; description?: string; iconReference?: string
  color?: string; type: EntryType; payload: EntryPlaintext; policy: AgentVisibilityPolicy; vaultId?: string
}): MemberSecretV1 {
  const fields = customFields(input.payload.fields)
  const publicAsset = parsePublicAssetIconReference(input.iconReference)
  const icon = publicAsset
    ? publicAsset
    : input.iconReference?.startsWith('vault-asset:')
      ? { kind: 'encryptedAsset' as const, assetId: input.iconReference.slice('vault-asset:'.length) }
      : input.iconReference
        ? { kind: 'glyph' as const, value: input.iconReference.replace(/^builtin:/, '').normalize('NFC') }
        : null
  const common = {
    schema: 'palladin.member-secret.v1' as const,
    memberLabel: input.label.normalize('NFC'),
    agentLabel: input.policy.discoverable ? input.agentLabel.normalize('NFC') : null,
    discoverable: input.policy.discoverable,
    description: input.description?.normalize('NFC') ?? null,
    icon,
    color: input.color?.toUpperCase() ?? null,
    agentFieldAccess: fieldPolicy(input.type, input.policy, input.payload),
  }
  if (input.payload.type === ENTRY_TYPE_KEY) return {
    ...common, entryType: 'key', content: {
      value: input.payload.value.normalize('NFC'),
      url: input.payload.url?.normalize('NFC') ?? null,
      notes: input.payload.notes?.normalize('NFC') ?? null,
      customFields: fields,
    },
  }
  if (input.payload.type === ENTRY_TYPE_CREDENTIAL) return {
    ...common, entryType: 'credential', content: {
      username: input.payload.username.normalize('NFC'), password: input.payload.password.normalize('NFC'),
      url: input.payload.url?.normalize('NFC') ?? null, urlDomain: domain(input.payload.url),
      totp: canonicalTotp(input.payload.totp),
      notes: input.payload.notes?.normalize('NFC') ?? null, customFields: fields,
    },
  }
  if (input.payload.type === ENTRY_TYPE_CREDIT_CARD) return {
    ...common, entryType: 'creditCard', content: {
      cardholderName: input.payload.cardholderName.normalize('NFC'),
      cardNumber: input.payload.cardNumber, expiryMonth: input.payload.expiryMonth,
      expiryYear: input.payload.expiryYear,
      billingAddress: input.payload.billingAddress?.normalize('NFC') ?? null,
      notes: input.payload.notes?.normalize('NFC') ?? null, customFields: fields,
    },
  }
  return {
    ...common, entryType: 'script', content: {
      source: input.payload.script.normalize('NFC'), interpreter: input.payload.interpreter,
      ...(input.payload.execution ? { execution: input.payload.execution } : {}),
      refs: (input.payload.refs ?? []).map((ref) => ({
        env: ref.env, vaultId: ref.vaultId ?? input.vaultId ?? '', entryId: ref.entryId, fieldId: refFieldId(ref),
      })),
      notes: input.payload.notes?.normalize('NFC') ?? null, customFields: fields,
    },
  }
}
