import { newFieldId } from './entry-blob'
import type { CustomField } from './types'

/**
 * `palladin.signin.v1` — one encrypted Credential custom field remembering how
 * the user signs in to the external service (federated provider + optional
 * provider account). The contract is shared with the browser extension and
 * mobile; anything that does not match it exactly is unrecognized and must be
 * preserved untouched unless the user explicitly replaces or removes it.
 */
export const SIGN_IN_METHOD_FIELD_TYPE = 'palladin.signin.v1'

export const SIGN_IN_PROVIDERS = ['google', 'apple', 'microsoft', 'github', 'facebook'] as const
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number]

export const SIGN_IN_ACCOUNT_MAX_LENGTH = 256

export interface SignInBinding {
  provider: SignInProvider
  account: string | null
}

export type SignInMethodState =
  | { kind: 'none' }
  | { kind: 'recognized'; fieldId: string; binding: SignInBinding }
  | { kind: 'unrecognized'; fieldId: string }
  | { kind: 'ambiguous'; fieldIds: string[] }

export function isSignInMethodField(field: CustomField): boolean {
  return field.type === SIGN_IN_METHOD_FIELD_TYPE
}

function isSignInProvider(value: unknown): value is SignInProvider {
  return typeof value === 'string' && (SIGN_IN_PROVIDERS as readonly string[]).includes(value)
}

function isCanonicalAccount(value: unknown): value is string | null {
  if (value === null) return true
  return typeof value === 'string'
    && value === value.normalize('NFC')
    && value === value.trim()
    && value.length >= 1
    && value.length <= SIGN_IN_ACCOUNT_MAX_LENGTH
}

/** Strict decoder: exactly `{ provider, account }` with canonical values, else null. */
export function parseSignInBinding(value: unknown): SignInBinding | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.length !== 2 || keys[0] !== 'account' || keys[1] !== 'provider') return null
  if (!isSignInProvider(record.provider) || !isCanonicalAccount(record.account)) return null
  return { provider: record.provider, account: record.account }
}

/** More than one binding is ambiguous and never usable for suggestions. */
export function readSignInMethod(fields: CustomField[]): SignInMethodState {
  const candidates = fields.filter(isSignInMethodField)
  if (candidates.length === 0) return { kind: 'none' }
  if (candidates.length > 1) return { kind: 'ambiguous', fieldIds: candidates.map((field) => field.id) }
  const [field] = candidates
  const binding = parseSignInBinding(field.value)
  return binding
    ? { kind: 'recognized', fieldId: field.id, binding }
    : { kind: 'unrecognized', fieldId: field.id }
}

/**
 * An account at a federated-sign-in service may have no Palladin-stored username
 * or password; only an unambiguous, recognized binding relaxes that requirement.
 */
export function hasRecognizedSignInMethod(fields: CustomField[]): boolean {
  return readSignInMethod(fields).kind === 'recognized'
}

/** Trimmed NFC account, or null when empty or longer than the contract allows. */
export function normalizeSignInAccount(input: string): string | null {
  const normalized = input.normalize('NFC').trim()
  if (normalized.length === 0 || normalized.length > SIGN_IN_ACCOUNT_MAX_LENGTH) return null
  return normalized
}

/**
 * Apply an explicit user edit: `null` removes every binding; otherwise exactly
 * one canonical field remains. A single recognized field keeps its id and label
 * so grant/history identity is stable; unrecognized or ambiguous fields are
 * replaced by one new field at the position of the first existing binding.
 */
export function replaceSignInMethod(
  fields: CustomField[],
  binding: SignInBinding | null,
  newLabel: string,
): CustomField[] {
  if (binding === null) return fields.filter((field) => !isSignInMethodField(field))
  // CustomField.value is typed for the editable kinds; decrypted values of other types are opaque JSON.
  const value = { provider: binding.provider, account: binding.account } as unknown as CustomField['value']
  const state = readSignInMethod(fields)
  if (state.kind === 'recognized') {
    return fields.map((field) => (field.id === state.fieldId ? { ...field, value } : field))
  }
  const replacement: CustomField = {
    id: newFieldId(),
    label: newLabel,
    type: SIGN_IN_METHOD_FIELD_TYPE,
    value,
  }
  const firstIndex = fields.findIndex(isSignInMethodField)
  if (firstIndex === -1) return [...fields, replacement]
  const kept = fields.filter((field, index) => index === firstIndex || !isSignInMethodField(field))
  return kept.map((field) => (isSignInMethodField(field) ? replacement : field))
}
