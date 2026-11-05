import { expect, it } from 'vitest'
import { submissionPayloadV2 } from './agent-submission-v2'
it('enforces the v2 TOTP seed UTF8 limit independently of custom text limits', () => {
  const payload = { schema: 'palladin.agent-submission-payload.v2', identity: { entryType: 1, submissionKind: 2 }, content: { customFields: [{ id: 'custom:11111111-1111-4111-8111-111111111111', type: 'totp', value: { secret: 'A'.repeat(1025), algorithm: 'SHA1', digits: 6, period: 30 } }] } }
  expect(submissionPayloadV2.safeParse(payload).success).toBe(false)
})
it.each(['A', 'MZ', 'AAA', 'AAAAAA', 'MZXR', 'MZXW7', 'MZXW6YR'])('rejects noncanonical unpadded TOTP Base32 seed %s', secret => {
  const payload = { schema: 'palladin.agent-submission-payload.v2', identity: { entryType: 1, submissionKind: 2 }, content: { customFields: [{ id: 'custom:11111111-1111-4111-8111-111111111111', type: 'totp', value: { secret, algorithm: 'SHA1', digits: 6, period: 30 } }] } }
  expect(submissionPayloadV2.safeParse(payload).success).toBe(false)
})
it.each(['MY', 'MZXQ', 'MZXW6', 'MZXW6YQ', 'MZXW6YTB'])('accepts canonical unpadded TOTP Base32 seed %s', secret => {
  const payload = { schema: 'palladin.agent-submission-payload.v2', identity: { entryType: 1, submissionKind: 2 }, content: { customFields: [{ id: 'custom:11111111-1111-4111-8111-111111111111', type: 'totp', value: { secret, algorithm: 'SHA1', digits: 6, period: 30 } }] } }
  expect(submissionPayloadV2.safeParse(payload).success).toBe(true)
})
it('keeps descriptions within the frozen Vault 4096-byte limit while notes allow 8192 bytes', () => {
  const payload = { schema: 'palladin.agent-submission-payload.v2', identity: { entryType: 1, submissionKind: 2 }, description: 'é'.repeat(2048), content: { notes: 'n'.repeat(8192) } }
  expect(submissionPayloadV2.safeParse(payload).success).toBe(true)
  expect(submissionPayloadV2.safeParse({ ...payload, description: payload.description + 'x' }).success).toBe(false)
})
