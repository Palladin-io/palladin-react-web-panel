import { describe, expect, it } from 'vitest'
import { organizationSchema } from './org-api'

describe('organization contract', () => {
  it('parses member and reserved-seat usage', () => {
    const organization = organizationSchema.parse({
      orgId: 'org-1',
      name: 'Example',
      memberCount: 2,
      seatUsage: 4,
      seatLimit: 5,
    })

    expect(organization.memberCount).toBe(2)
    expect(organization.seatUsage).toBe(4)
    expect(organization.seatLimit).toBe(5)
  })
})
