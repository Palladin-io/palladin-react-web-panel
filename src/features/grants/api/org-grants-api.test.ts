import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const postJson = vi.hoisted(() => vi.fn())
const deleteFn = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/api/client', () => ({
  api: {
    get: vi.fn(() => ({ json: getJson })),
    post: vi.fn(() => ({ json: postJson })),
    delete: deleteFn,
  },
}))

import { api } from '../../../shared/api/client'
import {
  createFullGrant,
  createGranularGrant,
  getOrgGrants,
  revokeGrant,
} from './org-grants-api'

const sampleGrant = {
  id: 'g1',
  vaultId: 'v1',
  vaultName: 'Production',
  agentId: 'a1',
  agentName: 'Deploy Bot',
  agentPublicKey: 'PUBKEY',
  type: 'granular',
  status: 'active',
  entryId: 'e1',
  entryLabel: 'Gmail',
  reason: 'Need it',
  expiresAt: null,
  queryLimit: 5,
  queryCount: 2,
  expirySource: 'uses',
  createdAt: '2026-06-01T10:00:00Z',
  createdByName: 'Alice',
  revokedByName: null,
  deniedByName: null,
  revokeReason: null,
  lastAccessedAt: '2026-06-02T09:00:00Z',
  lastAccessIp: '1.2.3.4',
  lastAccessHostname: 'ci-runner',
}

describe('org-grants-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    postJson.mockReset()
    deleteFn.mockReset()
    vi.mocked(api.get).mockClear()
    vi.mocked(api.post).mockClear()
  })

  it('parses the enriched org grants page', async () => {
    getJson.mockResolvedValue({ items: [sampleGrant], nextCursor: null })
    const page = await getOrgGrants({ status: 'active' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0].agentPublicKey).toBe('PUBKEY')
    expect(page.items[0].lastAccessIp).toBe('1.2.3.4')
    expect(page.items[0].vaultName).toBe('Production')
  })

  it('reads per-grant capability flags', async () => {
    getJson.mockResolvedValue({
      items: [{
        ...sampleGrant,
        canRevoke: true,
        canGrantAgain: false,
        activeCoveringGrantIds: ['11111111-1111-4111-8111-111111111111'],
      }],
    })
    const page = await getOrgGrants()
    expect(page.items[0].canRevoke).toBe(true)
    expect(page.items[0].canGrantAgain).toBe(false)
    expect(page.items[0].activeCoveringGrantIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ])
  })

  it('defaults capability flags to false when the backend omits them', async () => {
    // sampleGrant has no canRevoke/canGrantAgain — pre-rollout backend.
    getJson.mockResolvedValue({ items: [sampleGrant] })
    const page = await getOrgGrants()
    expect(page.items[0].canRevoke).toBe(false)
    expect(page.items[0].canGrantAgain).toBe(false)
    expect(page.items[0].activeCoveringGrantIds).toEqual([])
  })

  it('forwards filters as search params', async () => {
    getJson.mockResolvedValue({ items: [] })
    await getOrgGrants({ status: 'pending', agentId: 'a9', query: 'gm', pageSize: 50 })
    const params = (vi.mocked(api.get).mock.calls[0][1] as { searchParams: URLSearchParams })
      .searchParams
    expect(params.get('status')).toBe('pending')
    expect(params.get('agentId')).toBe('a9')
    expect(params.get('query')).toBe('gm')
    expect(params.get('pageSize')).toBe('50')
  })

  it('retains historical grant rows without rechecking epoch ranges', async () => {
    getJson.mockResolvedValue({ items: [sampleGrant, { ...sampleGrant, id: 'g2', agentAccessEpoch: 0, status: 'expired' }] })
    expect((await getOrgGrants()).items.map((grant) => grant.id)).toEqual(['g1', 'g2'])
  })

  it('keeps a forward-compatible backend lifecycle status', async () => {
    getJson.mockResolvedValue({ items: [{ ...sampleGrant, status: 'suspending' }] })

    const page = await getOrgGrants()

    expect(page.items[0].status).toBe('suspending')
  })

  it('preserves a future grant discriminator without inferring it from payload shape', async () => {
    getJson.mockResolvedValue({ items: [{ ...sampleGrant, type: 'future' }] })
    expect((await getOrgGrants()).items[0].type).toBe('future')
  })

  it('propagates a failed request instead of returning an empty history', async () => {
    getJson.mockRejectedValue(new Error('unavailable'))
    await expect(getOrgGrants()).rejects.toThrow('unavailable')
  })

  it.each(['active', 'expired', 'consumed', 'revoked', 'denied', 'superseded'])(
    'retains %s grants when the backend adds scope metadata', async (status) => {
      const scope = {
        entryId: 'e1', fieldIds: ['username', 'password'],
        fieldSelectionMode: 'selected', selectedFieldIds: ['username', 'password'],
        grantEnvelopeRevision: null, entryRevision: null, grantKeyVersion: null,
        memberKeyGeneration: null, recipientAgentKeyVersion: null, agentKeyFingerprint: null,
        futureDisplayMetadata: 'additional backend field',
      }
      getJson.mockResolvedValue({ items: [{ ...sampleGrant, status, entryScopes: [scope] }] })
      const page = await getOrgGrants()
      expect(page.items).toHaveLength(1)
      expect(page.items[0].status).toBe(status)
      expect(page.items[0].entryScopes[0].fieldSelectionMode).toBe('selected')
      expect(page.items[0].entryScopes[0]).toEqual(scope)
    },
  )

  it('POSTs a granular grant to the entry-scoped route', async () => {
    postJson.mockResolvedValue({ id: 'new' })
    const res = await createGranularGrant('v1', 'e1', {
      grantId: 'g1',
      agentId: 'a1',
      grantEntry: { descriptor: {} } as never,
      queryLimit: 3,
    })
    expect(res.id).toBe('new')
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('api/vaults/v1/entries/e1/grants', {
      json: expect.objectContaining({ agentId: 'a1', queryLimit: 3 }),
    })
  })

  it('POSTs a FULL grant to the full-vault route', async () => {
    postJson.mockResolvedValue({ id: 'new' })
    await createFullGrant('v1', {
      grantId: 'g1',
      agentId: 'a1',
      agentWrappedVaultKey: { wrappedVaultKey: {} } as never,
    })
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('api/vaults/v1/full-grants', {
      json: expect.objectContaining({ agentId: 'a1' }),
    })
  })

  it('sends a trimmed reason on revoke, empty body when none', async () => {
    deleteFn.mockResolvedValue(undefined)
    await revokeGrant('v1', 'g1', '  leak  ')
    expect(deleteFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1', {
      json: { reason: 'leak' },
    })
    deleteFn.mockClear()
    await revokeGrant('v1', 'g1')
    expect(deleteFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1', { json: {} })
  })
})
