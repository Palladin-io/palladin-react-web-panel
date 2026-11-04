import { expect, it } from 'vitest'
import { submissionPayloadV2 } from './agent-submission-v2'
it('enforces the v2 TOTP seed UTF8 limit independently of custom text limits', () => {
  const payload = { schema: 'palladin.agent-submission-payload.v2', identity: { entryType: 1, submissionKind: 2 }, content: { customFields: [{ id: 'custom:11111111-1111-4111-8111-111111111111', type: 'totp', value: { secret: 'A'.repeat(1025), algorithm: 'SHA1', digits: 6, period: 30 } }] } }
  expect(submissionPayloadV2.safeParse(payload).success).toBe(false)
})
