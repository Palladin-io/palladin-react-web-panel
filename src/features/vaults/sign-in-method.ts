import { SIGN_IN_FIELD_TYPE, SIGN_IN_FIELD_TYPE_V2, SIGN_IN_PROVIDERS, signInMethodValueSchema, type SignInMethodValue } from '@palladin/crypto'
import { getDomain } from 'tldts'
import { newFieldId } from './entry-blob'
import type { CustomField } from './types'

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

export function isSignInMethodField(field: CustomField): boolean {
  return field.type === SIGN_IN_METHOD_FIELD_TYPE || field.type === SIGN_IN_FIELD_TYPE_V2
}

/** Strict decoder: exactly `{ provider, account, entry }` per the shared schema, else null. */
export function parseSignInBinding(value: unknown): SignInBinding | null {
  const parsed = signInMethodValueSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** OAuth-only Login entries may contain one or more recognized methods. */
export function hasRecognizedSignInMethod(fields: CustomField[]): boolean {
  return readSignInMethods(fields).length > 0
}

/** Trimmed NFC account, or null when empty or longer than the contract allows. */
export function normalizeSignInAccount(input: string): string | null {
  const normalized = input.normalize('NFC').trim()
  if (normalized.length === 0 || normalized.length > SIGN_IN_ACCOUNT_MAX_LENGTH) return null
  return normalized
}

/** Only known contract versions with a valid value enter the editor. */
export function readSignInMethods(fields: CustomField[]): { fieldId: string; binding: SignInBinding }[] {
  return fields.flatMap((field) => {
    if (!isSignInMethodField(field)) return []
    const binding = parseSignInBinding(field.value)
    return binding ? [{ fieldId: field.id, binding }] : []
  })
}

/** Explicit per-method mutation; untouched fields keep their identity and bytes. */
export function updateSignInMethod(
  fields: CustomField[], fieldId: string | null, binding: SignInBinding | null, label: string,
): CustomField[] {
  if (fieldId === null) {
    return binding ? [...fields, { id: newFieldId(), label, type: SIGN_IN_FIELD_TYPE_V2,
      value: binding as unknown as CustomField['value'] }] : fields
  }
  return fields.flatMap((field) => {
    if (field.id !== fieldId || !isSignInMethodField(field) || !parseSignInBinding(field.value)) return [field]
    return binding ? [{ ...field, type: SIGN_IN_FIELD_TYPE_V2, value: binding as unknown as CustomField['value'] }] : []
  })
}
