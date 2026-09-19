import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const deleteFn = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/api/client', () => ({
  api: {
    get: vi.fn(() => ({ json: getJson })),
    delete: deleteFn,
  },
}))

import { api } from '../../../shared/api/client'
import { getVaultGrants, getGrant, revokeGrant } from './grants-api'

const sampleGrant = {
  grantId: 'g1',
  vaultId: 'v1',
  agentId: 'a1',
  agentName: 'Deploy Bot',
  entryId: 'e1',
  entryLabel: 'Gmail',
  status: 'active',
  type: 'granular',
  reason: 'Need Gmail',
  expiresAt: null,
  queryLimit: 5,
  queryCount: 1,
  createdAt: '2026-05-01T10:00:00Z',
  createdByName: 'Alice',
  revokedAt: null,
  revokedByName: null,
  revokeReason: null,
}

function withoutGrantType() {
  const grant: Partial<typeof sampleGrant> = { ...sampleGrant }
  delete grant.type
  return grant
}

describe('grants-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    deleteFn.mockReset()
    vi.mocked(api.get).mockClear()
  })

  it('parses a grants page', async () => {
    getJson.mockResolvedValue({ items: [sampleGrant], nextCursor: 'next' })
    const page = await getVaultGrants('v1', { status: 'active' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0].grantId).toBe('g1')
    expect(page.items[0].entryLabel).toBe('Gmail')
    expect(page.items[0].reason).toBe('Need Gmail')
    expect(page.nextCursor).toBe('next')
  })

  it('maps the current backend id/type projection for grant detail links', async () => {
    getJson.mockResolvedValue({
      ...sampleGrant,
      id: 'g2',
      type: 'full',
      grantId: undefined,
      entryId: null,
    })

    const grant = await getGrant('v1', 'g2')
    expect(grant.grantId).toBe('g2')
    expect(grant.type).toBe('full')
  })

  it('uses the authoritative type even when the legacy alias disagrees', async () => {
    getJson.mockResolvedValue({ ...sampleGrant, type: 'granular', mode: 'full' })
    expect((await getGrant('v1', 'g1')).type).toBe('granular')
  })

  it('does not infer grant type from a legacy alias', async () => {
    getJson.mockResolvedValue({ ...withoutGrantType(), mode: 'full' })
    expect((await getGrant('v1', 'g1')).type).toBeUndefined()
  })

  it('retains every server grant including a future type', async () => {
    getJson.mockResolvedValue({ items: [sampleGrant, { ...sampleGrant, grantId: 'g2', type: 'future' }], nextCursor: 'more' })
    const page = await getVaultGrants('v1')
    expect(page.items.map((item) => item.grantId)).toEqual(['g1', 'g2'])
    expect(page.items[1].type).toBe('future')
    expect(page.nextCursor).toBe('more')
  })

  it('keeps a forward-compatible backend lifecycle status', async () => {
    getJson.mockResolvedValue({
      items: [{ ...sampleGrant, status: 'suspending', futureDisplayHint: true }],
      nextCursor: null,
    })

    const page = await getVaultGrants('v1')

    expect(page.items[0].status).toBe('suspending')
    expect(page.items[0]).toHaveProperty('futureDisplayHint', true)
  })

  it('forwards filters as search params', async () => {
    getJson.mockResolvedValue({ items: [] })
    await getVaultGrants('v1', { status: 'pending', agentId: 'a9', pageSize: 20 })
    const call = vi.mocked(api.get).mock.calls[0]
    const params = (call[1] as { searchParams: URLSearchParams }).searchParams
    expect(params.get('status')).toBe('pending')
    expect(params.get('agentId')).toBe('a9')
    expect(params.get('pageSize')).toBe('20')
  })

  it('preserves additive management metadata without a runtime schema', async () => {
    getJson.mockResolvedValue({ ...sampleGrant, futureDisplayHint: 'new field' })
    expect(await getGrant('v1', 'g1')).toHaveProperty('futureDisplayHint', 'new field')
  })

  it('propagates transport errors instead of pretending the list is empty', async () => {
    getJson.mockRejectedValue(new Error('unavailable'))
    await expect(getVaultGrants('v1')).rejects.toThrow('unavailable')
  })

  it('sends a trimmed reason on revoke', async () => {
    deleteFn.mockResolvedValue(undefined)
    await revokeGrant('v1', 'g1', '  compromised  ')
    expect(deleteFn).toHaveBeenCalledWith(
      'api/vaults/v1/grants/g1',
      { json: { reason: 'compromised' } },
    )
  })

  it('sends empty body when no reason given', async () => {
    deleteFn.mockResolvedValue(undefined)
    await revokeGrant('v1', 'g1')
    expect(deleteFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1', undefined)
  })
})
