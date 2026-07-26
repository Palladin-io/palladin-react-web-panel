import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))
const deleteFn = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/api/client', () => ({
  api: { get: getFn, delete: deleteFn },
}))

import { getVaultMembers, requestOrganizationMemberRemoval } from './vault-members-api'

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
    deleteFn.mockReset()
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

  it('treats DELETE as a staged removal request', async () => {
    deleteFn.mockResolvedValue(undefined)
    await requestOrganizationMemberRemoval(member.memberId)
    expect(deleteFn).toHaveBeenCalledWith(`api/organization/members/${member.memberId}`)
  })
})
