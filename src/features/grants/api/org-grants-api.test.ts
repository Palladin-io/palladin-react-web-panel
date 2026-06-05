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
  createGrantProactively,
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
      items: [{ ...sampleGrant, canRevoke: true, canGrantAgain: false }],
    })
    const page = await getOrgGrants()
    expect(page.items[0].canRevoke).toBe(true)
    expect(page.items[0].canGrantAgain).toBe(false)
  })

  it('defaults capability flags to false when the backend omits them', async () => {
    // sampleGrant has no canRevoke/canGrantAgain — pre-rollout backend.
    getJson.mockResolvedValue({ items: [sampleGrant] })
    const page = await getOrgGrants()
    expect(page.items[0].canRevoke).toBe(false)
    expect(page.items[0].canGrantAgain).toBe(false)
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

  it('skips a single malformed row instead of collapsing the list', async () => {
    getJson.mockResolvedValue({ items: [sampleGrant, { nope: true }] })
    const page = await getOrgGrants()
    expect(page.items).toHaveLength(1)
  })

  it('strips ciphertext fields at the parse boundary', async () => {
    getJson.mockResolvedValue({
      items: [{ ...sampleGrant, agentWrappedDek: 'leak', reEncryptedBlob: 'leak' }],
    })
    const page = await getOrgGrants()
    expect(page.items[0]).not.toHaveProperty('agentWrappedDek')
    expect(page.items[0]).not.toHaveProperty('reEncryptedBlob')
  })

  it('POSTs a proactive grant with the envelope + queryLimit', async () => {
    postJson.mockResolvedValue({ id: 'new' })
    const res = await createGrantProactively('v1', {
      agentId: 'a1',
      type: 'granular',
      entryId: 'e1',
      grantEntries: [
        { entryId: 'e1', reEncryptedBlob: 'b', nonce: 'n', agentWrappedDek: 'd' },
      ],
      queryLimit: 3,
    })
    expect(res.id).toBe('new')
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('api/vaults/v1/grants', {
      json: expect.objectContaining({ agentId: 'a1', queryLimit: 3 }),
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
