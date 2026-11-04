import { SIGN_IN_FIELD_TYPE, SIGN_IN_PROVIDERS, signInMethodValueSchema, type SignInMethodValue } from '@palladin/crypto'
import { getDomain } from 'tldts'
import { newFieldId } from './entry-blob'
import type { CustomField } from './types'

/**
 * `palladin.signin.v1` — one encrypted Credential custom field remembering how
 * the user signs in to the external service: federated provider, optional
 * provider account and optional reference to the provider's own Palladin
 * Credential. The value schema is owned by `@palladin/crypto` and shared with
 * the extension and mobile; anything that does not match it exactly (including
 * the retired two-key shape) is unrecognized and must be preserved untouched
 * unless the user explicitly replaces or removes it.
 */
export const SIGN_IN_METHOD_FIELD_TYPE = SIGN_IN_FIELD_TYPE
export { SIGN_IN_PROVIDERS }
export type SignInProvider = SignInMethodValue['provider']
export type SignInBinding = SignInMethodValue
export type SignInEntryReference = NonNullable<SignInMethodValue['entry']>

export const SIGN_IN_ACCOUNT_MAX_LENGTH = 256

/** Registrable domains of each provider's own account Credentials (contract v1.1). */
const PROVIDER_ACCOUNT_DOMAINS: Record<SignInProvider, readonly string[]> = {
  google: ['google.com'],
  apple: ['apple.com'],
  microsoft: ['live.com', 'microsoftonline.com', 'microsoft.com'],
  github: ['github.com'],
  facebook: ['facebook.com'],
}

/** Whether a Credential URL domain belongs to the provider's own account service. */
export function isProviderAccountDomain(provider: SignInProvider, urlDomain: string | null | undefined): boolean {
  const domain = urlDomain ? getDomain(urlDomain) : null
  return domain !== null && PROVIDER_ACCOUNT_DOMAINS[provider].includes(domain)
}

export type SignInMethodState =
  | { kind: 'none' }
  | { kind: 'recognized'; fieldId: string; binding: SignInBinding }
  | { kind: 'unrecognized'; fieldId: string }
  | { kind: 'ambiguous'; fieldIds: string[] }

export function isSignInMethodField(field: CustomField): boolean {
  return field.type === SIGN_IN_METHOD_FIELD_TYPE
}

/** Strict decoder: exactly `{ provider, account, entry }` per the shared schema, else null. */
export function parseSignInBinding(value: unknown): SignInBinding | null {
  const parsed = signInMethodValueSchema.safeParse(value)
  return parsed.success ? parsed.data : null
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
  const value = {
    provider: binding.provider,
    account: binding.account,
    entry: binding.entry ? { vaultId: binding.entry.vaultId, entryId: binding.entry.entryId } : null,
  } as unknown as CustomField['value']
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
