import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))
const postJson = vi.hoisted(() => vi.fn())
const postFn = vi.hoisted(() => vi.fn(() => ({ json: postJson })))

vi.mock('../../../shared/api/client', () => ({
  api: { get: getFn, post: postFn },
}))

vi.mock('../../../shared/api/public-assets-api', () => ({
  getPublicAssetsByIds: vi.fn(),
}))

import { approveAgentPairingWithNewKey, claimAgentPairingForNewKey, claimAgentPairing, getAgents } from './agents-api'

const pendingAgent = {
  agentId: '33332233-4455-4677-8899-aabbccddeeff',
  name: 'Allegro E2E',
  status: 'pending',
  type: 'Unknown',
  iconKey: null,
  iconColor: null,
  publicKeyPrefix: 'ABCDEFGH',
  publicKeySuffix: '12345678',
  publicKey: null,
  recipientKeyVersion: 1,
  accessEpoch: 0,
  createdAt: '2026-08-29T12:00:00Z',
  enrolledAt: null,
  enrolledByName: null,
  deactivatedAt: null,
  deactivatedByName: null,
  reactivatedAt: null,
  reactivatedByName: null,
  lastAccessAt: null,
  description: null,
  lastIp: '127.0.0.1',
  lastHostname: 'Patryks-Mac-Studio.local',
}

describe('agents-api', () => {
  it('uses separate create-only claim and approval contracts', async () => {
    const pairingId = '67ad9d63-f947-4b6c-8f64-e564d42d620f'
    await claimAgentPairingForNewKey(pairingId)
    await approveAgentPairingWithNewKey(pairingId, { displayName: 'Friendly Fox', newApiKeyName: 'Automation' })
    expect(postFn.mock.calls).toEqual([
      [`api/agent-pairings/${pairingId}/claim-for-new-key`, { json: { pairingId } }],
      [`api/agent-pairings/${pairingId}/approve-with-new-key`, { json: { pairingId, displayName: 'Friendly Fox', newApiKeyName: 'Automation' } }],
    ])
    expect(getFn).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    getJson.mockReset()
    getFn.mockClear()
    postJson.mockReset()
    postFn.mockClear()
  })

  it('returns a pending Agent with the backend-owned access epoch 0', async () => {
    getJson.mockResolvedValue({ items: [pendingAgent] })

    await expect(getAgents()).resolves.toEqual([pendingAgent])
    expect(getFn).toHaveBeenCalledWith('api/agents')
  })

  it('does not reject a backend lifecycle status while rendering the list', async () => {
    const deactivating = { ...pendingAgent, status: 'deactivating', accessEpoch: 2 }
    getJson.mockResolvedValue({ items: [deactivating] })

    await expect(getAgents()).resolves.toEqual([deactivating])
  })

  it('rejects a route-controlled pairing ID before constructing an authenticated request', async () => {
    await expect(claimAgentPairing('../agents/123/deactivate?')).rejects.toBeDefined()
    expect(postFn).not.toHaveBeenCalled()
  })

  it('uses a canonical pairing ID only as one URL path segment', async () => {
    postJson.mockResolvedValue({ pairingId: '67ad9d63-f947-4b6c-8f64-e564d42d620f' })

    await claimAgentPairing('67ad9d63-f947-4b6c-8f64-e564d42d620f')

    expect(postFn).toHaveBeenCalledWith(
      'api/agent-pairings/67ad9d63-f947-4b6c-8f64-e564d42d620f/claim',
      { json: { pairingId: '67ad9d63-f947-4b6c-8f64-e564d42d620f' } },
    )
  })
})
