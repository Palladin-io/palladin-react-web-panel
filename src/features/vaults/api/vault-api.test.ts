import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))

vi.mock('../../../shared/api/client', () => ({
  api: { get: getFn },
}))

import { getAllEntries } from './vault-api'

describe('getAllEntries', () => {
  beforeEach(() => {
    getFn.mockClear()
    getJson.mockReset()
  })

  it('follows nextCursor across pages and concatenates every entry', async () => {
    getJson
      .mockResolvedValueOnce({
        items: [{ id: 'e1', label: 'One', type: 'credential' }],
        nextCursor: 'CURSOR_2',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'e2', label: 'Two', type: 'key' }],
        nextCursor: undefined,
      })

    const all = await getAllEntries('vault-1')

    expect(all.map((e) => e.id)).toEqual(['e1', 'e2'])
    // Second request must carry the cursor from the first page.
    expect(getFn).toHaveBeenCalledTimes(2)
    expect(getFn.mock.calls[0][1]).toEqual({ searchParams: undefined })
    expect(getFn.mock.calls[1][1]).toEqual({ searchParams: { cursor: 'CURSOR_2' } })
    // Wire `type` strings are normalised to the numeric EntryType.
    expect(all[0].type).toBe(1)
    expect(all[1].type).toBe(0)
  })

  it('returns a single page when there is no next cursor', async () => {
    getJson.mockResolvedValueOnce({ items: [{ id: 'e1', label: 'Solo', type: 'key' }] })
    const all = await getAllEntries('vault-1')
    expect(all).toHaveLength(1)
    expect(getFn).toHaveBeenCalledTimes(1)
  })
})
