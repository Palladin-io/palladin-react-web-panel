import { describe, expect, it } from 'vitest'
import { organizationMemberSchema } from './team-members-api'

describe('organizationMemberSchema', () => {
  it('accepts multiple custom roles and preserves effective permissions', () => {
    const member = organizationMemberSchema.parse({
      userId: 'user-1',
      displayName: 'Alice Morgan',
      email: 'alice@example.com',
      publicKey: null,
      roles: [
        { id: 'role-1', name: 'Auditor', permissions: 128, isSystem: false, canAssign: true },
        { id: 'role-2', name: 'Vault manager', permissions: 8, isSystem: false, canAssign: false },
      ],
      effectivePermissions: 136,
      isOwner: false,
      joinedAt: '2026-07-12T10:00:00Z',
    })

    expect(member.roles.map((role) => role.name)).toEqual([
      'Auditor',
      'Vault manager',
    ])
    expect(member.effectivePermissions).toBe(136)
  })
})
