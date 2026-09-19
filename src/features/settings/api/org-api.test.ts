import { expect, it, vi } from 'vitest'
const json = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/client', () => ({ api: { get: vi.fn(() => ({ json })) } }))
import { getOrganization } from './org-api'

it('preserves the server display contract and its intended projection', async () => {

  const response = { orgId: 'org', name: 'Example', memberCount: 2, seatUsage: 4, seatLimit: 5 }
  json.mockResolvedValue(response)
  expect(await getOrganization()).toEqual(response)
})
