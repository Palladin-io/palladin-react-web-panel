import { expect, it, vi } from 'vitest'
const json = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ api: { get: vi.fn(() => ({ json })) } }))
import { getOrganizationMembers } from './team-members-api'

it('preserves the server display contract and its intended projection', async () => {

  const member = { userId: 'user', displayName: 'Alice', email: 'alice@example.com', publicKey: null, roles: [{ id: 'r1', name: 'Auditor', permissions: 128 }, { id: 'r2', name: 'Manager', permissions: 8 }], effectivePermissions: 136, isOwner: false, joinedAt: '2026-07-12T10:00:00Z', status: 'future' }
  json.mockResolvedValue({ items: [member] })
  expect(await getOrganizationMembers()).toEqual([member])
})
