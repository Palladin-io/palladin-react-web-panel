import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteFn = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ api: { delete: deleteFn } }))

import { requestOrganizationMemberRemoval } from './organization-members-api'

describe('organization members API', () => {
  beforeEach(() => deleteFn.mockReset())

  it('treats DELETE as a staged removal request', async () => {
    deleteFn.mockResolvedValue(undefined)
    const memberId = '123e4567-e89b-42d3-a456-426614174000'

    await requestOrganizationMemberRemoval(memberId)

    expect(deleteFn).toHaveBeenCalledWith(`api/organization/members/${memberId}`)
  })
})
