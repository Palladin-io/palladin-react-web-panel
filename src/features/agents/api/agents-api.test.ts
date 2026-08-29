import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))

vi.mock('../../../shared/api/client', () => ({
  api: { get: getFn },
}))

vi.mock('../../../shared/api/public-assets-api', () => ({
  getPublicAssetsByIds: vi.fn(),
}))

import { getAgents } from './agents-api'

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
  beforeEach(() => {
    getJson.mockReset()
    getFn.mockClear()
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
})
