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
  mode: 'granular',
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
    expect(page.nextCursor).toBe('next')
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

  it('strips unknown (crypto) fields at the parse boundary', async () => {
    getJson.mockResolvedValue({
      // A malicious/buggy backend leaking crypto material must not reach the UI.
      ...sampleGrant,
      agentWrappedDek: 'should-not-survive',
      reEncryptedBlob: 'nope',
    })
    const grant = await getGrant('v1', 'g1')
    expect(grant).not.toHaveProperty('agentWrappedDek')
    expect(grant).not.toHaveProperty('reEncryptedBlob')
  })

  it('rejects a malformed grant (missing required field)', async () => {
    getJson.mockResolvedValue({ grantId: 'g1' })
    await expect(getGrant('v1', 'g1')).rejects.toBeDefined()
  })

  it('sends a trimmed reason on revoke', async () => {
    deleteFn.mockResolvedValue(undefined)
    await revokeGrant('v1', 'g1', '  compromised  ')
    expect(deleteFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1', {
      json: { reason: 'compromised' },
    })
  })

  it('sends empty body when no reason given', async () => {
    deleteFn.mockResolvedValue(undefined)
    await revokeGrant('v1', 'g1')
    expect(deleteFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1', { json: {} })
  })
})
