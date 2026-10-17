import { z } from 'zod'

export function sharingRecipients(input: string): string[] | null {
  const parts = input.split(',').map((part) => part.trim())
  if (parts.length === 0 || parts.length > 20 || parts.some((part) => !z.email().max(320).safeParse(part).success)) return null
  const seen = new Set<string>()
  for (const part of parts) {
    const normalized = part.toLocaleLowerCase('en-US')
    if (seen.has(normalized)) return null
    seen.add(normalized)
  }
  return parts
}

// Input-quality feedback, not an offline cryptographic protection or server gate.
export function obviousSharingPin(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false
  for (const width of [1, 2, 3]) {
    if (value.length >= width * 2 && value.length % width === 0 && value === value.slice(0, width).repeat(value.length / width)) return true
  }
  return [1, 9].some((step) => [...value].slice(1).every((digit, index) =>
    (Number(digit) - Number(value[index]) + 10) % 10 === step))
}

export const sharingFormSchema = z.object({
  recipientMode: z.enum(['namedRecipient', 'anyoneWithLink']),
  recipientEmail: z.string(),
  protection: z.enum(['none', 'password', 'pin']),
  protectionSecret: z.string(),
  lifetimeHours: z.enum(['1', '24', '72', '168']),
  maximumReceipts: z.union([z.literal(''), z.string().regex(/^[1-9]\d*$/).refine((value) => Number(value) <= 100)]),
  notifyOnFirstReceipt: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.recipientMode === 'namedRecipient' && !sharingRecipients(value.recipientEmail)) {
    ctx.addIssue({ code: 'custom', path: ['recipientEmail'], message: 'email' })
  }
  if (value.protection === 'password' && (value.protectionSecret.length < 8 || value.protectionSecret.length > 128)) {
    ctx.addIssue({ code: 'custom', path: ['protectionSecret'], message: 'password' })
  }
  if (value.protection === 'pin' && (!/^[0-9]{6,128}$/.test(value.protectionSecret) || obviousSharingPin(value.protectionSecret))) {
    ctx.addIssue({ code: 'custom', path: ['protectionSecret'], message: 'pin' })
  }
})

export type SharingForm = z.infer<typeof sharingFormSchema>

export const initialSharingForm: SharingForm = {
  recipientMode: 'anyoneWithLink', recipientEmail: '', protection: 'none', protectionSecret: '',
  lifetimeHours: '24', maximumReceipts: '', notifyOnFirstReceipt: false,
}

export function sharingFieldInvalid(form: SharingForm, field: keyof SharingForm): boolean {
  const parsed = sharingFormSchema.safeParse(form)
  return !parsed.success && parsed.error.issues.some((issue) => issue.path[0] === field)
}
