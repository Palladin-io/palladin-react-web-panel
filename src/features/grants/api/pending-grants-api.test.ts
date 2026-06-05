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

// Real backend shape (GrantResponse projection) — the actual `/pending-grants`
// payload, with the new `agentName` / `entryLabel` enrichment.
const samplePending = {
  id: 'g1',
  vaultId: 'v1',
  agentId: 'a1',
  agentName: 'Deploy Bot',
  type: 'granular',
  status: 'pending',
  entryId: 'e1',
  entryLabel: 'Gmail',
  reason: 'Need to send email',
  expiresAt: null,
  queryLimit: null,
  queryCount: 0,
  expirySource: 'uses',
  createdAt: '2026-06-01T10:00:00Z',
  createdBy: 'u1',
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
}

describe('pending-grants-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    putFn.mockReset()
    vi.mocked(api.get).mockClear()
  })

  it('parses the real backend shape (id, agentName, entryLabel)', async () => {
    getJson.mockResolvedValue({ items: [samplePending], nextCursor: null })
    const items = await getPendingGrants()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('g1')
    expect(items[0].agentName).toBe('Deploy Bot')
    expect(items[0].entryLabel).toBe('Gmail')
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

  it('skips a single malformed item instead of collapsing the whole list', async () => {
    getJson.mockResolvedValue({
      // One valid + one malformed (missing required `id`/`createdAt`).
      items: [samplePending, { foo: 'bar' }],
    })
    const items = await getPendingGrants()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('g1')
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
