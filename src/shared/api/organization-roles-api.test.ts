import { describe, expect, it } from 'vitest'
import { assignablePermissionSchema, organizationRoleSchema } from './organization-roles-api'

describe('organization roles contract', () => {
  it('parses role assignment counts and permission catalog entries', () => {
    expect(organizationRoleSchema.parse({
      id: 'role-1',
      name: 'Auditor',
      permissions: 128,
      isSystem: false,
      canAssign: true,
      assignedMemberCount: 3,
    }).assignedMemberCount).toBe(3)
    expect(assignablePermissionSchema.parse({ key: 'AuditView', value: 128, canAssign: false })).toEqual({
      key: 'AuditView',
      value: 128,
      canAssign: false,
    })
  })
})
