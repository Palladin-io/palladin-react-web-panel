import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))

vi.mock('../../../shared/api/client', () => ({
  api: { get: getFn },
}))

import { getVaultMembers } from './vault-members-api'

const member = {
  memberId: '123e4567-e89b-42d3-a456-426614174000',
  memberName: 'Vault owner',
  addedAt: '2026-07-26T09:00:00Z',
  deprovisioningStatus: 'WaitingForRotation',
  rotationId: '223e4567-e89b-42d3-a456-426614174000',
}

describe('vault members API', () => {
  beforeEach(() => {
    getFn.mockClear()
    getJson.mockReset()
  })

  it('keeps keyset pagination bounded and parses structural status', async () => {
    getJson.mockResolvedValue({ items: [member], nextAfterId: member.memberId })

    const result = await getVaultMembers('vault-1', member.memberId)

    expect(result.items[0]).toEqual(member)
    expect(getFn).toHaveBeenCalledWith('api/vaults/vault-1/members', {
      searchParams: { pageSize: 50, afterId: member.memberId },
    })
  })

  it('rejects an unbounded or expanded response contract', async () => {
    getJson.mockResolvedValue({
      items: Array.from({ length: 101 }, () => member),
      nextAfterId: null,
    })
    await expect(getVaultMembers('vault-1')).rejects.toThrow()
  })

  it('keeps an unknown backend removal status and ignores optional fields', async () => {
    getJson.mockResolvedValue({
      items: [{ ...member, deprovisioningStatus: 'AwaitingExternalApproval', futureHint: true }],
      nextAfterId: null,
      futurePageHint: true,
    })

    const result = await getVaultMembers('vault-1')

    expect(result.items[0].deprovisioningStatus).toBe('AwaitingExternalApproval')
    expect(result.items[0]).not.toHaveProperty('futureHint')
    expect(result).not.toHaveProperty('futurePageHint')
  })

})
