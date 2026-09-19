import { expect, it, vi } from 'vitest'
const json = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ api: { get: vi.fn(() => ({ json })) } }))
import { getOrganizationMemberDirectory } from './organization-member-directory-api'

it('preserves the server display contract and its intended projection', async () => {

  const rows = [{ userId: 'former-member', displayName: 'Former member', email: 'private@example.com', roles: ['admin'] }]
  json.mockResolvedValue({ items: rows })
  expect(await getOrganizationMemberDirectory()).toEqual([{ userId: 'former-member', displayName: 'Former member' }])
})
