import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/api/client', () => ({
  api: { get: vi.fn(() => ({ json: getJson })) },
}))

import { api } from '../../../shared/api/client'
import { getAgentDiscoveryProvisioning } from './agent-discovery-api'

const item = {
  agentId: '123e4567-e89b-42d3-a456-426614174000',
  agentName: 'Deploy Agent',
  x25519PublicKey: 'eDI1NTE5LXB1YmxpYy1rZXk=',
  ed25519PublicKey: 'ZWQyNTUxOS1wdWJsaWMta2V5',
  recipientKeyVersion: 3,
  status: 'current',
  manifestRevision: '42',
}

describe('agent-discovery-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    vi.mocked(api.get).mockClear()
  })

  it('parses current and pending provisioning state', async () => {
    getJson.mockResolvedValue({
      items: [item, { ...item, agentId: '223e4567-e89b-42d3-a456-426614174000', status: 'pending', manifestRevision: null }],
    })

    await expect(getAgentDiscoveryProvisioning('vault-1')).resolves.toMatchObject([
      { status: 'current', recipientKeyVersion: 3 },
      { status: 'pending', manifestRevision: null },
    ])
    expect((await getAgentDiscoveryProvisioning('vault-1'))[0]).not.toHaveProperty('x25519PublicKey')
    expect(api.get).toHaveBeenCalledWith('api/vaults/vault-1/discovery/agents')
  })

  it.each([
    { ...item, status: 'stale' },
    { ...item, recipientKeyVersion: 0 },
    { ...item, agentId: 'not-a-uuid' },
    { ...item, manifestRevision: '-1' },
    { ...item, manifestRevision: '18446744073709551616' },
  ])('rejects malformed provisioning rows', async (invalid) => {
    getJson.mockResolvedValue({ items: [invalid] })
    await expect(getAgentDiscoveryProvisioning('vault-1')).rejects.toThrow()
  })

  it('fails closed when the response exceeds the bounded Agent list', async () => {
    getJson.mockResolvedValue({ items: Array.from({ length: 1_001 }, () => item) })
    await expect(getAgentDiscoveryProvisioning('vault-1')).rejects.toThrow()
  })
})
