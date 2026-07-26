import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))
const postText = vi.hoisted(() => vi.fn())
const postFn = vi.hoisted(() => vi.fn(() => Promise.resolve({ text: postText })))

vi.mock('../../../shared/api/client', () => ({
  api: { get: getFn, post: postFn },
}))

import { getAllEntries, getCanonicalEntry, importEntries } from './vault-api'

describe('getCanonicalEntry', () => {
  it('rejects a projection whose authenticated scope differs from the Entry head', async () => {
    const organizationId = '00112233-4455-4677-8899-aabbccddeeff'
    const vaultId = '11112233-4455-4677-8899-aabbccddeeff'
    const id = '22222233-4455-4677-8899-aabbccddeeff'
    const header = { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 3,
      resourceRevision: '1', keyVersion: 1, memberKeyGeneration: 1, nonce: 'nonce' }
    const scope = { organizationId, vaultId, entryId: id }
    getJson.mockResolvedValueOnce({ organizationId, vaultId, id, state: 'active', currentRevision: '1',
      memberIndexRevision: '1', agentDiscoveryRevision: null, currentKeyVersion: 1,
      createdAt: '2026-07-26T00:00:00Z', createdBy: organizationId,
      updatedAt: '2026-07-26T00:00:00Z', updatedBy: organizationId,
      memberIndex: { ...scope, vaultId: '33332233-4455-4677-8899-aabbccddeeff', memberIndexRevision: '1',
        header: { ...header, projectionKind: 2 }, ciphertext: 'cipher' },
      memberSecret: { ...scope, revision: '1', operation: 1, header, ciphertext: 'cipher' },
      agentDiscovery: null,
      entryKey: { ...scope, wrapperRevision: '1', keyVersion: 1, memberKeyGeneration: 1,
        wrappingKeyVersion: 1, header: { ...header, projectionKind: 8 }, wrappedEntryDekByVk: 'wrapped' },
    })
    await expect(getCanonicalEntry(vaultId, id)).rejects.toThrow('Entry envelope scope mismatch')
  })
})

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

describe('importEntries', () => {
  beforeEach(() => {
    postFn.mockClear()
    postText.mockReset()
  })

  const body = {
    format: 'generic-csv',
    entries: [
      { label: 'A', type: 0 as const, content: { encryptedBlob: 'x', nonce: 'y' }, grantEntries: [] },
      { label: 'B', type: 0 as const, content: { encryptedBlob: 'x', nonce: 'y' }, grantEntries: [] },
    ],
  }

  it('parses a JSON success body', async () => {
    postText.mockResolvedValueOnce(JSON.stringify({ importedCount: 2, entryIds: ['e1', 'e2'] }))
    const res = await importEntries('vault-1', body)
    expect(res).toEqual({ importedCount: 2, entryIds: ['e1', 'e2'] })
  })

  it('treats an empty 2xx body as success (count = items sent) instead of throwing', async () => {
    postText.mockResolvedValueOnce('')
    const res = await importEntries('vault-1', body)
    expect(res).toEqual({ importedCount: 2, entryIds: [] })
  })
})
