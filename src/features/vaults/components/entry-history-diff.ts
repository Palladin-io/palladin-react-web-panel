import type { MemberSecretView } from '../../../shared/crypto/entry-draft'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
} from '../types'

export type HistoricalEntryField =
  | 'memberLabel'
  | 'icon'
  | 'entryType'
  | 'agentLabel'
  | 'description'
  | 'url'
  | 'value'
  | 'username'
  | 'password'
  | 'totp'
  | 'interpreter'
  | 'script'
  | 'refs'
  | 'cardholderName'
  | 'cardNumber'
  | 'expiryMonth'
  | 'expiryYear'
  | 'billingAddress'
  | 'customFields'
  | 'notes'
  | 'discoverable'
  | 'fieldPolicy'

export interface EntryHistoryDiff {
  fields: ReadonlySet<HistoricalEntryField>
  customFieldIds: ReadonlySet<string>
  hasChanges: boolean
}

/**
 * Compares only locally decrypted values. The server keeps returning opaque
 * revision envelopes; field-level history remains inside the zero-knowledge
 * boundary and is discarded together with the revealed form.
 */
export function compareEntryVersionToCurrent(
  historical: MemberSecretView,
  current: MemberSecretView,
): EntryHistoryDiff {
  const fields = new Set<HistoricalEntryField>()
  const changed = (field: HistoricalEntryField, before: unknown, now: unknown) => {
    if (!sameValue(before, now)) fields.add(field)
  }

  changed('memberLabel', historical.memberLabel, current.memberLabel)
  changed('icon', [historical.iconReference ?? '', historical.color ?? ''], [
    current.iconReference ?? '', current.color ?? '',
  ])
  changed('entryType', historical.entryType, current.entryType)
  changed('agentLabel', historical.agentLabel, current.agentLabel)
  changed('description', historical.description ?? '', current.description ?? '')
  changed('notes', historical.content.notes ?? '', current.content.notes ?? '')
  changed('discoverable', historical.agentVisibilityPolicy.discoverable, current.agentVisibilityPolicy.discoverable)
  changed('fieldPolicy', historical.agentVisibilityPolicy.fields, current.agentVisibilityPolicy.fields)

  if (historical.content.type !== current.content.type) {
    markVisibleContentFields(fields, historical)
  } else if (historical.content.type === ENTRY_TYPE_KEY && current.content.type === ENTRY_TYPE_KEY) {
    changed('url', historical.content.url ?? '', current.content.url ?? '')
    changed('value', historical.content.value, current.content.value)
  } else if (historical.content.type === ENTRY_TYPE_CREDENTIAL
    && current.content.type === ENTRY_TYPE_CREDENTIAL) {
    changed('url', historical.content.url ?? '', current.content.url ?? '')
    changed('username', historical.content.username, current.content.username)
    changed('password', historical.content.password, current.content.password)
    changed('totp', historical.content.totp ?? '', current.content.totp ?? '')
  } else if (historical.content.type === ENTRY_TYPE_SCRIPT
    && current.content.type === ENTRY_TYPE_SCRIPT) {
    changed('interpreter', historical.content.interpreter, current.content.interpreter)
    changed('script', historical.content.script, current.content.script)
    changed('refs', historical.content.refs ?? [], current.content.refs ?? [])
  } else if (historical.content.type === ENTRY_TYPE_CREDIT_CARD
    && current.content.type === ENTRY_TYPE_CREDIT_CARD) {
    changed('cardholderName', historical.content.cardholderName, current.content.cardholderName)
    changed('cardNumber', historical.content.cardNumber, current.content.cardNumber)
    changed('expiryMonth', historical.content.expiryMonth, current.content.expiryMonth)
    changed('expiryYear', historical.content.expiryYear, current.content.expiryYear)
    changed('billingAddress', historical.content.billingAddress ?? '', current.content.billingAddress ?? '')
  }

  const historicalCustomFields = historical.content.fields ?? []
  const currentCustomFields = current.content.fields ?? []
  const currentById = new Map(currentCustomFields.map((field) => [field.id, field]))
  const historicalIds = new Set(historicalCustomFields.map((field) => field.id))
  const customFieldIds = new Set(
    historicalCustomFields
      .filter((field) => !sameValue(field, currentById.get(field.id)))
      .map((field) => field.id),
  )
  if (customFieldIds.size > 0
    || currentCustomFields.some((field) => !historicalIds.has(field.id))
    || !sameValue(historicalCustomFields.map((field) => field.id), currentCustomFields.map((field) => field.id))) {
    fields.add('customFields')
  }

  return { fields, customFieldIds, hasChanges: fields.size > 0 }
}

function markVisibleContentFields(fields: Set<HistoricalEntryField>, secret: MemberSecretView) {
  if (secret.content.type === ENTRY_TYPE_KEY) {
    fields.add('url'); fields.add('value')
  } else if (secret.content.type === ENTRY_TYPE_CREDENTIAL) {
    fields.add('url'); fields.add('username'); fields.add('password')
    if (secret.content.totp) fields.add('totp')
  } else if (secret.content.type === ENTRY_TYPE_SCRIPT) {
    fields.add('interpreter'); fields.add('script')
    if (secret.content.refs?.length) fields.add('refs')
  } else if (secret.content.type === ENTRY_TYPE_CREDIT_CARD) {
    fields.add('cardholderName'); fields.add('cardNumber'); fields.add('expiryMonth')
    fields.add('expiryYear'); fields.add('billingAddress')
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}
