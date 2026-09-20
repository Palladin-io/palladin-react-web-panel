import { z } from 'zod'

export const sharingFormSchema = z.object({
  recipientMode: z.enum(['namedRecipient', 'anyoneWithLink']),
  recipientEmail: z.string(),
  protection: z.enum(['none', 'password', 'pin']),
  protectionSecret: z.string(),
  lifetimeHours: z.enum(['1', '24', '72', '168']),
  maximumReceipts: z.string().regex(/^[1-9]\d*$/).refine((value) => Number(value) <= 100),
  notifyOnFirstReceipt: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.recipientMode === 'namedRecipient' && !z.email().max(320).safeParse(value.recipientEmail.trim()).success) {
    ctx.addIssue({ code: 'custom', path: ['recipientEmail'], message: 'email' })
  }
  if (value.protection === 'password' && (value.protectionSecret.length < 8 || value.protectionSecret.length > 128)) {
    ctx.addIssue({ code: 'custom', path: ['protectionSecret'], message: 'password' })
  }
  if (value.protection === 'pin' && !/^[0-9]{6,128}$/.test(value.protectionSecret)) {
    ctx.addIssue({ code: 'custom', path: ['protectionSecret'], message: 'pin' })
  }
})

export type SharingForm = z.infer<typeof sharingFormSchema>

export const initialSharingForm: SharingForm = {
  recipientMode: 'namedRecipient', recipientEmail: '', protection: 'none', protectionSecret: '',
  lifetimeHours: '24', maximumReceipts: '1', notifyOnFirstReceipt: false,
}

export function sharingFieldInvalid(form: SharingForm, field: keyof SharingForm): boolean {
  const parsed = sharingFormSchema.safeParse(form)
  return !parsed.success && parsed.error.issues.some((issue) => issue.path[0] === field)
}
