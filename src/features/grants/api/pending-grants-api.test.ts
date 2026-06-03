import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const putFn = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/api/client', () => ({
  api: {
    get: vi.fn(() => ({ json: getJson })),
    put: putFn,
  },
}))

import { api } from '../../../shared/api/client'
import {
  approveGrant,
  denyGrant,
  getPendingGrants,
} from './pending-grants-api'

const samplePending = {
  grantId: 'g1',
  vaultId: 'v1',
  vaultName: 'Prod',
  agentId: 'a1',
  agentName: 'Deploy Bot',
  agentPublicKey: 'BASE64_PUBKEY',
  entryId: 'e1',
  entryLabel: 'Gmail',
  reason: 'Need to send email',
  createdAt: '2026-06-01T10:00:00Z',
}

describe('pending-grants-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    putFn.mockReset()
    vi.mocked(api.get).mockClear()
  })

  it('maps a pending grants list', async () => {
    getJson.mockResolvedValue({ items: [samplePending] })
    const items = await getPendingGrants()
    expect(items).toHaveLength(1)
    expect(items[0].grantId).toBe('g1')
    expect(items[0].agentPublicKey).toBe('BASE64_PUBKEY')
    expect(items[0].entryId).toBe('e1')
  })

  it('strips unknown (crypto) fields at the parse boundary', async () => {
    getJson.mockResolvedValue({
      items: [
        {
          ...samplePending,
          // A buggy/malicious backend leaking key material must not survive.
          agentWrappedDek: 'leak',
          vaultKey: 'leak',
        },
      ],
    })
    const items = await getPendingGrants()
    expect(items[0]).not.toHaveProperty('agentWrappedDek')
    expect(items[0]).not.toHaveProperty('vaultKey')
  })

  it('rejects a malformed pending grant (missing required field)', async () => {
    getJson.mockResolvedValue({ items: [{ grantId: 'g1' }] })
    await expect(getPendingGrants()).rejects.toBeDefined()
  })

  it('PUTs the approve envelope with an expiresAt policy', async () => {
    putFn.mockResolvedValue(undefined)
    await approveGrant('v1', 'g1', {
      grantEntry: {
        entryId: 'e1',
        reEncryptedBlob: 'blob',
        nonce: 'nonce',
        agentWrappedDek: 'dek',
      },
      expiresAt: '2026-06-04T12:00:00.000Z',
    })
    expect(putFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1/approve', {
      json: {
        grantEntry: {
          entryId: 'e1',
          reEncryptedBlob: 'blob',
          nonce: 'nonce',
          agentWrappedDek: 'dek',
        },
        expiresAt: '2026-06-04T12:00:00.000Z',
      },
    })
  })

  it('sends a trimmed reason on deny, empty body when none', async () => {
    putFn.mockResolvedValue(undefined)
    await denyGrant('v1', 'g1', '  too risky  ')
    expect(putFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1/deny', {
      json: { reason: 'too risky' },
    })

    putFn.mockClear()
    await denyGrant('v1', 'g1')
    expect(putFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1/deny', {
      json: {},
    })
  })
})
