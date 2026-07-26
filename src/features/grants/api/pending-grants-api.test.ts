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
  id: '33333333-3333-4333-8333-333333333333',
  vaultId: '22222222-2222-4222-8222-222222222222',
  agentId: '44444444-4444-4444-8444-444444444444',
  agentName: 'Deploy Bot',
  type: 'granular',
  status: 'pending',
  entryId: '55555555-5555-4555-8555-555555555555',
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
  encryptedReason: {
    organizationId: '11111111-1111-4111-8111-111111111111',
    vaultId: '22222222-2222-4222-8222-222222222222',
    entryId: '55555555-5555-4555-8555-555555555555',
    grantRequestId: '33333333-3333-4333-8333-333333333333',
    agentId: '44444444-4444-4444-8444-444444444444',
    requestRevision: '1',
    header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 6, projectionKind: 8, resourceRevision: '1', keyVersion: 1, memberKeyGeneration: 1, nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    reasonKeyVersion: 1,
    agentMessageKeyVersion: 1,
    recipientAgentMessageKeyFingerprint: 'A'.repeat(43),
    requestedMethods: 6,
    ciphertext: 'ciphertext',
    agentMessageWrappedReasonDek: 'wrapped',
    agentSignature: 'A'.repeat(86),
  },
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
    expect(items[0].id).toBe(samplePending.id)
    expect(items[0].agentName).toBe('Deploy Bot')
    expect(items[0].entryLabel).toBe('Gmail')
    expect(items[0].entryId).toBe(samplePending.entryId)
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
    expect(items[0].id).toBe(samplePending.id)
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
