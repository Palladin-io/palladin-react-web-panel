import { z } from 'zod'

export const SUBMISSION_PAYLOAD_V2_SCHEMA = 'palladin.agent-submission-payload.v2'
const unpaired = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
function text(max: number, empty = true) {
  return z.string().refine(value => (empty || value.length > 0) && !unpaired.test(value) && value === value.normalize('NFC'))
    .refine(value => { const bytes = new TextEncoder().encode(value); const valid = bytes.length <= max; bytes.fill(0); return valid })
}
const totp = z.strictObject({
  secret: text(1024, false).regex(/^[A-Z2-7]+$/), algorithm: z.enum(['SHA1', 'SHA256', 'SHA512']),
  digits: z.union([z.literal(6), z.literal(8)]), period: z.number().int().min(15).max(120),
  issuer: text(1024).nullable().optional(), account: text(1024).nullable().optional(),
})
const fieldBase = { id: z.string().regex(/^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), label: text(128, false).optional() }
const field = z.union([
  z.strictObject({ ...fieldBase, type: z.enum(['text', 'multiline', 'concealed']), value: text(16384) }),
  z.strictObject({ ...fieldBase, type: z.literal('totp'), value: totp }),
])
export type SubmissionCustomField = z.infer<typeof field>
export const submissionPayloadV2 = z.strictObject({
  schema: z.literal(SUBMISSION_PAYLOAD_V2_SCHEMA),
  identity: z.object({ entryType: z.union([z.literal(0), z.literal(1)]), submissionKind: z.union([z.literal(1), z.literal(2)]) }).passthrough(),
  label: text(256, false).optional(), description: text(8192).optional(),
  content: z.strictObject({
    username: text(1024).optional(), password: text(4096).optional(), value: text(16384).optional(),
    url: text(2048).optional(), notes: text(8192).optional(),
    customFields: z.array(field).max(64).refine(fields => new Set(fields.map(field => field.id)).size === fields.length).optional(),
  }),
}).superRefine((payload, ctx) => {
  const reject = () => ctx.addIssue({ code: 'custom', message: 'invalid-field' })
  const credential = payload.identity.entryType === 1, create = payload.identity.submissionKind === 1
  if (credential ? payload.content.value !== undefined : payload.content.username !== undefined || payload.content.password !== undefined) reject()
  if (credential && payload.content.url !== undefined) {
    try { const url = new URL(payload.content.url); if (url.protocol !== 'https:' || !url.hostname) reject() } catch { reject() }
  }
  if (create) {
    if (!payload.label || (credential ? !payload.content.username || !payload.content.password : !payload.content.value)) reject()
    if (payload.content.customFields?.some(field => !field.label)) reject()
  } else if (payload.label === undefined && payload.description === undefined
    && !Object.keys(payload.content).some(key => key !== 'customFields') && !payload.content.customFields?.length) reject()
})
