import { describe, expect, it } from 'vitest'
import { auditLogItemSchema } from './audit-api'

describe('auditLogItemSchema', () => {
  it('strips legacy backend presentation fields from the structural contract', () => {
    const parsed = auditLogItemSchema.parse({
      id: 'audit-1',
      eventType: 'credential.accessed',
      actorType: 'agent',
      userId: null,
      agentId: 'agent-1',
      vaultId: 'vault-1',
      entryId: 'entry-1',
      agentName: 'MALICIOUS SERVER AGENT',
      actorName: 'MALICIOUS SERVER MEMBER',
      entryLabel: 'MALICIOUS SERVER ENTRY',
      agentReason: 'MALICIOUS SERVER REASON',
      metadata: {},
      createdAt: '2026-07-26T12:00:00Z',
    })

    expect(parsed).not.toHaveProperty('agentName')
    expect(parsed).not.toHaveProperty('actorName')
    expect(parsed).not.toHaveProperty('entryLabel')
    expect(parsed).not.toHaveProperty('agentReason')
  })
})
