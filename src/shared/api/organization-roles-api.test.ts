import { expect, it, vi } from 'vitest'
const json = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ api: { get: vi.fn(() => ({ json })) } }))
import { getOrganizationRoles } from './organization-roles-api'

it('preserves the server display contract and its intended projection', async () => {

  const response = { items: [{ id: 'role', name: 'Auditor', permissions: 128, isSystem: false, canAssign: true, assignedMemberCount: 3 }], assignablePermissions: [{ key: 'Future', value: 0, canAssign: false }] }
  json.mockResolvedValue(response)
  expect(await getOrganizationRoles()).toEqual(response)
})
