import { beforeEach, describe, expect, it, vi } from 'vitest'

const postJson = vi.hoisted(() => vi.fn())
const postFn = vi.hoisted(() => vi.fn(() => ({ json: postJson })))
vi.mock('../../shared/api/client', () => ({ api: { post: postFn } }))

import { getAdministrativeSearch } from './search-api'

const agentId = '11111111-1111-4111-8111-111111111111'
const memberId = '22222222-2222-4222-8222-222222222222'

describe('getAdministrativeSearch', () => {
  beforeEach(() => {
    postFn.mockClear()
    postJson.mockReset()
  })

  it('sends the ephemeral query only in a POST body with cancellation', async () => {
    postJson.mockResolvedValue({ results: [
      { type: 'agent', id: agentId, name: 'Deploy Bot', futureHint: true },
      { type: 'member', id: memberId, name: 'Ada' },
    ], futurePageHint: true })
    const controller = new AbortController()
    const result = await getAdministrativeSearch('private query', controller.signal, 8)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'agent', id: agentId, name: 'Deploy Bot', futureHint: true })
    expect(postFn).toHaveBeenCalledWith('api/search', {
      json: { q: 'private query', limit: 8 },
      signal: controller.signal,
    })
    expect(postFn.mock.calls[0][0]).not.toContain('private query')
  })

  it('does not revalidate server-owned identifier and label constraints', async () => {
    const row = { type: 'agent', id: 'legacy-id', name: 'A'.repeat(300) }
    postJson.mockResolvedValue({ results: [row] })
    await expect(getAdministrativeSearch('agent', new AbortController().signal)).resolves.toEqual([row])
  })
})
