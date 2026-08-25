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
export function compareEntryVersionToPrevious(
  version: MemberSecretView,
  previous: MemberSecretView,
): EntryHistoryDiff {
  const fields = new Set<HistoricalEntryField>()
  const changed = (field: HistoricalEntryField, before: unknown, now: unknown) => {
    if (!sameValue(before, now)) fields.add(field)
  }

  changed('memberLabel', version.memberLabel, previous.memberLabel)
  changed('icon', [version.iconReference ?? '', version.color ?? ''], [
    previous.iconReference ?? '', previous.color ?? '',
  ])
  changed('entryType', version.entryType, previous.entryType)
  changed('agentLabel', version.agentLabel, previous.agentLabel)
  changed('description', version.description ?? '', previous.description ?? '')
  changed('notes', version.content.notes ?? '', previous.content.notes ?? '')

  if (version.content.type !== previous.content.type) {
    markVisibleContentFields(fields, version)
  } else if (version.content.type === ENTRY_TYPE_KEY && previous.content.type === ENTRY_TYPE_KEY) {
    changed('url', version.content.url ?? '', previous.content.url ?? '')
    changed('value', version.content.value, previous.content.value)
  } else if (version.content.type === ENTRY_TYPE_CREDENTIAL
    && previous.content.type === ENTRY_TYPE_CREDENTIAL) {
    changed('url', version.content.url ?? '', previous.content.url ?? '')
    changed('username', version.content.username, previous.content.username)
    changed('password', version.content.password, previous.content.password)
    changed('totp', version.content.totp ?? '', previous.content.totp ?? '')
  } else if (version.content.type === ENTRY_TYPE_SCRIPT
    && previous.content.type === ENTRY_TYPE_SCRIPT) {
    changed('interpreter', version.content.interpreter, previous.content.interpreter)
    changed('script', version.content.script, previous.content.script)
    changed('refs', version.content.refs ?? [], previous.content.refs ?? [])
  } else if (version.content.type === ENTRY_TYPE_CREDIT_CARD
    && previous.content.type === ENTRY_TYPE_CREDIT_CARD) {
    changed('cardholderName', version.content.cardholderName, previous.content.cardholderName)
    changed('cardNumber', version.content.cardNumber, previous.content.cardNumber)
    changed('expiryMonth', version.content.expiryMonth, previous.content.expiryMonth)
    changed('expiryYear', version.content.expiryYear, previous.content.expiryYear)
    changed('billingAddress', version.content.billingAddress ?? '', previous.content.billingAddress ?? '')
  }

  const versionCustomFields = version.content.fields ?? []
  const previousCustomFields = previous.content.fields ?? []
  const previousById = new Map(previousCustomFields.map((field) => [field.id, field]))
  const versionIds = new Set(versionCustomFields.map((field) => field.id))
  const customFieldIds = new Set(
    versionCustomFields
      .filter((field) => !sameValue(field, previousById.get(field.id)))
      .map((field) => field.id),
  )
  if (customFieldIds.size > 0
    || previousCustomFields.some((field) => !versionIds.has(field.id))
    || !sameValue(versionCustomFields.map((field) => field.id), previousCustomFields.map((field) => field.id))) {
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
