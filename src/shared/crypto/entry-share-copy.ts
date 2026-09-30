import { z } from 'zod'
import { parseEntryShareSnapshot, type EntryShareSnapshot } from './entry-share'
import { defaultAgentVisibilityPolicy, toMemberSecret } from './entry-draft'
import { encodeMemberSecret, type MemberSecretV1 } from './vault-plaintext'
import { parseOtpauthUri } from './totp'
import type { CustomField, EntryPlaintext } from '../../features/vaults/types'

const requiredFields = {
  key: [], credential: [], script: ['script.interpreter'],
  creditCard: ['creditCard.cardholderName', 'creditCard.cardNumber', 'creditCard.expiryMonth', 'creditCard.expiryYear'],
} as const

export const entryShareCopyFormSchema = z.strictObject({
  title: z.string().trim().min(1).max(256),
  additions: z.record(z.string(), z.string()),
})
export type EntryShareCopyForm = z.infer<typeof entryShareCopyFormSchema>

export const entryShareCopyAdditionSchemas: Readonly<Record<string, z.ZodType<string>>> = {
  'script.interpreter': z.enum(['bash', 'sh', 'node', 'python']),
  'creditCard.cardholderName': z.string().min(1).max(256),
  'creditCard.cardNumber': z.string().regex(/^\d{12,19}$/),
  'creditCard.expiryMonth': z.string().regex(/^(0[1-9]|1[0-2])$/),
  'creditCard.expiryYear': z.string().regex(/^\d{4}$/),
}

export function missingEntryShareCopyFields(snapshot: EntryShareSnapshot): string[] {
  const present = new Set(snapshot.fields.map((field) => field.id))
  return requiredFields[snapshot.entryType].filter((id) => !present.has(id))
}

export function entryShareCopySecret(snapshot: EntryShareSnapshot, form: EntryShareCopyForm): MemberSecretV1 {
  try {
    const source = parseEntryShareSnapshot(snapshot)
    const choices = entryShareCopyFormSchema.parse(form)
    const missing = new Set(missingEntryShareCopyFields(source))
    if (Object.keys(choices.additions).some((id) => !missing.has(id))) throw new Error()
    const values = new Map(source.fields.map((field) => [field.id, field.value]))
    for (const id of missing) values.set(id, entryShareCopyAdditionSchemas[id].parse(choices.additions[id] ?? ''))
    // Never silently normalize a received credential to satisfy the canonical storage schema.
    for (const [id, value] of values) if (!id.startsWith('custom:') && value !== value.normalize('NFC')) throw new Error()
    const get = (id: string) => values.get(id)
    const fields: CustomField[] = source.fields.filter((field) => field.id.startsWith('custom:')).map((field) => {
      const value = field.type === 'totp' ? parseOtpauthUri(field.value) : field.value
      if (value === null) throw new Error()
      return { id: crypto.randomUUID(), label: field.label, type: field.type, value }
    })
    const common = { fields, notes: get('notes') }
    let payload: EntryPlaintext
    if (source.entryType === 'credential') payload = { ...common, type: 1,
      username: get('credential.username') ?? '', password: get('credential.password') ?? '',
      url: get('credential.url'), totp: get('credential.totp') }
    else if (source.entryType === 'key') payload = { ...common, type: 0,
      value: get('key.value') ?? '', url: get('key.url') }
    else if (source.entryType === 'creditCard') payload = { ...common, type: 3,
      cardholderName: get('creditCard.cardholderName') ?? '', cardNumber: get('creditCard.cardNumber') ?? '',
      cvv: get('creditCard.cvv'),
      expiryMonth: get('creditCard.expiryMonth') ?? '', expiryYear: get('creditCard.expiryYear') ?? '',
      billingAddress: get('creditCard.billingAddress') }
    else payload = { ...common, type: 2, script: get('script.source') ?? '', refs: [],
      interpreter: z.enum(['bash', 'sh', 'node', 'python']).parse(get('script.interpreter')) }
    const secret = toMemberSecret({ label: choices.title, agentLabel: choices.title, description: get('description'),
      type: payload.type, payload, policy: defaultAgentVisibilityPolicy(payload.type, fields) })
    const bytes = encodeMemberSecret(secret)
    bytes.fill(0)
    return secret
  } catch { throw new Error('Shared copy cannot be saved with these fields') }
}
