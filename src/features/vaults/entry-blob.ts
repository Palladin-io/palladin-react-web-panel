import { randomUuid } from '../../shared/crypto/random-uuid'
import {
  BLOB_VERSION_V2,
  type CustomField,
  type CustomFieldType,
  type EntryPlaintext,
  type ScriptRef,
  type TotpParams,
  canBeAgentVisible,
  isTotpField,
} from './types'

/**
 * Helpers for the v2 encrypted-blob `fields[]` — reading them back off a
 * decrypted plaintext (tolerating older/unknown shapes) and folding editor
 * state into the blob before re-encryption. Kept out of components so the
 * create-entry and edit paths share one implementation.
 */

/** Fresh client-side id for a new custom field. */
export function newFieldId(): string {
  return randomUuid()
}

/** Default label stored for the dedicated credential 2FA field. */
export const DEFAULT_TOTP_LABEL = '2FA'

/** Build a blank editable field of the given kind (empty label + value). */
export function blankField(type: CustomFieldType): CustomField {
  if (type === 'totp') {
    return { id: newFieldId(), label: '', type, value: emptyTotp() }
  }
  return { id: newFieldId(), label: '', type, value: '' }
}

/** A blank dedicated credential-2FA field (fixed label, empty seed). */
export function newTotpField(): CustomField {
  return { id: newFieldId(), label: DEFAULT_TOTP_LABEL, type: 'totp', value: emptyTotp() }
}

function emptyTotp(): TotpParams {
  return { secret: '', algorithm: 'SHA1', digits: 6, period: 30 }
}

/**
 * Split the dedicated credential 2FA field (the FIRST totp field) from the rest.
 * The pinned field renders as a first-class row under the password; any further
 * totp fields stay in Additional fields. Order of the remaining fields is kept.
 */
export function splitCredentialTotp(fields: CustomField[]): {
  pinned: CustomField | null
  rest: CustomField[]
} {
  const index = fields.findIndex((f) => f.type === 'totp')
  if (index === -1) return { pinned: null, rest: fields }
  return {
    pinned: fields[index],
    rest: fields.filter((_, i) => i !== index),
  }
}

/** Merge the dedicated 2FA field back in front of the additional fields. */
export function mergeCredentialTotp(
  pinned: CustomField | null,
  rest: CustomField[],
): CustomField[] {
  return pinned ? [pinned, ...rest] : rest
}

export type CustomFieldError = 'label-required' | 'duplicate-label'

export interface CustomFieldValidation {
  /** Per-field-id error, if any. */
  errors: Record<string, CustomFieldError>
  hasError: boolean
}

/** Does an editable field carry a value worth persisting? */
function fieldHasValue(field: CustomField): boolean {
  if (isTotpField(field)) return field.value.secret.trim() !== ''
  return typeof field.value === 'string' && field.value.trim() !== ''
}

/**
 * Validate an editable field set: a row with a value must have a label (else its
 * value would be silently dropped at fold time), and labels must be unique
 * (case-insensitive) because the agent CLI rejects duplicate field labels.
 */
export function validateCustomFields(fields: CustomField[]): CustomFieldValidation {
  const errors: Record<string, CustomFieldError> = {}

  const byLabel = new Map<string, string[]>()
  for (const field of fields) {
    const label = field.label.trim().toLowerCase()
    if (!label) {
      if (fieldHasValue(field)) errors[field.id] = 'label-required'
      continue
    }
    byLabel.set(label, [...(byLabel.get(label) ?? []), field.id])
  }
  for (const ids of byLabel.values()) {
    if (ids.length > 1) {
      for (const id of ids) errors[id] = errors[id] ?? 'duplicate-label'
    }
  }

  return { errors, hasError: Object.keys(errors).length > 0 }
}

/**
 * Read `fields[]` off a decrypted plaintext, guaranteeing every field has an id
 * (older blobs may omit it) so React keys and reorder stay stable. Unknown field
 * types pass through untouched — the renderer decides what to do with them.
 */
export function readCustomFields(plaintext: EntryPlaintext): CustomField[] {
  const raw = plaintext.fields
  if (!Array.isArray(raw)) return []
  return raw.map((field) => ({
    ...field,
    id: field.id || newFieldId(),
  }))
}

/**
 * Fold editor field state into the persisted `fields[]`: trim labels and
 * string values, drop rows with no label or no value, keep order. TOTP fields
 * survive only when they carry a secret; unknown-typed fields round-trip
 * untouched (forward-compat). Returns `undefined` when nothing remains so the
 * blob can stay v1.
 */
export function foldCustomFields(fields: CustomField[]): CustomField[] | undefined {
  const folded: CustomField[] = []
  for (const field of fields) {
    const label = field.label.trim()
    if (!label) continue
    if (isTotpField(field)) {
      if (!field.value.secret.trim()) continue
      folded.push({ id: field.id, label, type: 'totp', value: field.value })
    } else if (typeof field.value === 'string') {
      const value = field.value.trim()
      if (!value) continue
      // `agentVisible` only rides along on the text-ish types that may be exposed.
      const agentVisible = field.agentVisible && canBeAgentVisible(field.type) ? true : undefined
      folded.push({ id: field.id, label, type: field.type, value, ...(agentVisible ? { agentVisible } : {}) })
    } else {
      folded.push({ ...field, label })
    }
  }
  return folded.length > 0 ? folded : undefined
}

/** Max agent-visible fields mirrored to entry metadata (backend AgentFieldRules). */
export const MAX_AGENT_FIELDS = 20
const AGENT_LABEL_MAX = 200
const AGENT_VALUE_MAX = 2000

/**
 * Build the plaintext `agentFields` mirror for the create/update request: the
 * subset of fields the owner marked agent-visible (text/multiline only, with a
 * label and value), in display order, capped to the backend limits. This is the
 * discovery-metadata view (like Label/Description) — the encrypted blob remains
 * the source of truth. Returns undefined when there are none.
 */
export function agentFieldsFrom(
  fields: CustomField[],
): { label: string; value: string }[] | undefined {
  const out: { label: string; value: string }[] = []
  for (const field of fields) {
    if (!field.agentVisible || !canBeAgentVisible(field.type)) continue
    if (typeof field.value !== 'string') continue
    const label = field.label.trim()
    const value = field.value.trim()
    if (!label || !value) continue
    out.push({ label: label.slice(0, AGENT_LABEL_MAX), value: value.slice(0, AGENT_VALUE_MAX) })
    if (out.length >= MAX_AGENT_FIELDS) break
  }
  return out.length > 0 ? out : undefined
}

/**
 * Attach folded custom fields to a well-known plaintext, stamping `v: 2` only
 * when fields are present so a plain KEY/CREDENTIAL blob stays byte-identical to
 * v1 (older clients keep reading it). SCRIPT entries are always v2 and set their
 * own `v` at the call site.
 */
export function withCustomFields<T extends EntryPlaintext>(
  base: T,
  fields: CustomField[],
): T {
  const folded = foldCustomFields(fields)
  if (!folded) return base
  return { ...base, v: BLOB_VERSION_V2, fields: folded }
}

/** Keep only fully-specified SCRIPT ref rows, trimming the env-var name. */
export function foldScriptRefs(refs: ScriptRef[]): ScriptRef[] {
  return refs
    .map((ref) => ({ ...ref, env: ref.env.trim() }))
    .filter((ref) => ref.env !== '' && ref.entryId !== '' && ref.field !== '')
}

/**
 * Structural equality of two plaintexts, ignoring key order and `undefined`
 * values (an absent field and an `undefined` field are the same on the wire).
 * Used by the inline-edit panel to detect whether the encrypted blob actually
 * changed — cheaper and less error-prone than field-by-field comparison, and it
 * naturally covers custom fields and script refs.
 */
export function plaintextsEqual(a: EntryPlaintext, b: EntryPlaintext): boolean {
  return canonical(a) === canonical(b)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}
