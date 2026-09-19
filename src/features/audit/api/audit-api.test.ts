import { describe, expect, it, vi } from 'vitest'
const json = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ api: { get: vi.fn(() => ({ json })) } }))
import { getVaultAuditLogs } from './audit-api'

describe('audit structural projection', () => {
  it('strips legacy backend presentation fields from the structural contract', async () => {
    json.mockResolvedValue({ items: [{
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
    }] })
    const { items: [parsed] } = await getVaultAuditLogs('vault-1')

    expect(parsed).not.toHaveProperty('agentName')
    expect(parsed).not.toHaveProperty('actorName')
    expect(parsed).not.toHaveProperty('entryLabel')
    expect(parsed).not.toHaveProperty('agentReason')
  })
})
