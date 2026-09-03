import { describe, expect, it } from 'vitest'
import { organizationMemberDirectoryItemSchema } from './organization-member-directory-api'

describe('organization Member directory API', () => {
  it('retains only the minimal display identity contract without rejecting additive fields', () => {
    expect(organizationMemberDirectoryItemSchema.parse({
      userId: 'member-id',
      displayName: 'Ada Admin',
    })).toEqual({ userId: 'member-id', displayName: 'Ada Admin' })

    expect(organizationMemberDirectoryItemSchema.parse({
      userId: 'member-id',
      displayName: 'Ada Admin',
      email: 'ada@example.com',
    })).toEqual({ userId: 'member-id', displayName: 'Ada Admin' })
  })
})
