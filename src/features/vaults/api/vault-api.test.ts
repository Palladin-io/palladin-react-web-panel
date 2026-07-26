import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))
const postText = vi.hoisted(() => vi.fn())
const postJson = vi.hoisted(() => vi.fn())
const postFn = vi.hoisted(() => vi.fn(() => ({ text: postText, json: postJson })))

vi.mock('../../../shared/api/client', () => ({
  api: { get: getFn, post: postFn },
}))

import { getAllEntries, getCanonicalEntry, getEntryHistory, importEntries, restoreCanonicalEntry } from './vault-api'

describe('getEntryHistory', () => {
  const organizationId = '00112233-4455-4677-8899-aabbccddeeff'
  const vaultId = '11112233-4455-4677-8899-aabbccddeeff'
  const entryId = '22222233-4455-4677-8899-aabbccddeeff'
  const historyItem = (overrides = {}) => ({
    revision: '7', memberSequence: '9', discoverySequence: null,
    changedAt: '2026-07-26T00:00:00Z', changedByType: 'member', changedById: organizationId,
    operation: 'updated', keyVersion: 2,
    entryKey: { organizationId, vaultId, entryId, wrapperRevision: '2', keyVersion: 2,
      memberKeyGeneration: 1, wrappingKeyVersion: 1,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 8,
        resourceRevision: '2', keyVersion: 2, memberKeyGeneration: 1, nonce: 'nonce' },
      wrappedEntryDekByVk: 'wrapped' },
    memberSecret: { organizationId, vaultId, entryId, revision: '7', operation: 'updated',
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 3,
        resourceRevision: '7', keyVersion: 2, memberKeyGeneration: 1, nonce: 'nonce' }, ciphertext: 'cipher' },
    ...overrides,
  })

  it('normalizes wire enums and sends the revision cursor', async () => {
    getJson.mockResolvedValueOnce({ currentRevision: '7', items: [historyItem()], nextBeforeRevision: '7',
      policy: { maximumVersions: 100, maximumAgeDays: 365 } })
    const page = await getEntryHistory(vaultId, entryId, '8')
    expect(page.items[0]).toMatchObject({ operation: 2, changedByType: 1 })
    expect(getFn).toHaveBeenCalledWith(expect.stringContaining('/history'), {
      searchParams: { pageSize: '20', beforeRevision: '8' },
    })
  })

  it('fails closed when a historical key envelope belongs to another Entry', async () => {
    getJson.mockResolvedValueOnce({ currentRevision: '7', items: [historyItem({
      entryKey: { ...historyItem().entryKey, entryId: '33332233-4455-4677-8899-aabbccddeeff' },
    })], nextBeforeRevision: null, policy: { maximumVersions: 100, maximumAgeDays: 365 } })
    await expect(getEntryHistory(vaultId, entryId)).rejects.toThrow('scope mismatch')
  })
})

describe('getCanonicalEntry', () => {
  it('rejects a projection whose authenticated scope differs from the Entry head', async () => {
    const organizationId = '00112233-4455-4677-8899-aabbccddeeff'
    const vaultId = '11112233-4455-4677-8899-aabbccddeeff'
    const id = '22222233-4455-4677-8899-aabbccddeeff'
    const header = { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 3,
      resourceRevision: '1', keyVersion: 1, memberKeyGeneration: 1, nonce: 'nonce' }
    const scope = { organizationId, vaultId, entryId: id }
    getJson.mockResolvedValueOnce({ organizationId, vaultId, id, state: 'active', currentRevision: '1',
      memberIndexRevision: '1', agentDiscoveryRevision: null, agentDiscoveryRevisionHighWatermark: '0', currentKeyVersion: 1,
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

describe('restoreCanonicalEntry', () => {
  beforeEach(() => {
    postFn.mockClear()
    postJson.mockReset()
  })

  it('accepts only a canonical Active lifecycle response', async () => {
    postJson.mockResolvedValueOnce({ state: 'active', currentRevision: '8' })
    await expect(restoreCanonicalEntry('vault', 'entry', {
      baseRevision: '7', memberSecret: {} as never,
    })).resolves.toEqual({ state: 'active', currentRevision: '8' })

    postJson.mockResolvedValueOnce({ state: 'archived', currentRevision: '8' })
    await expect(restoreCanonicalEntry('vault', 'entry', {
      baseRevision: '7', memberSecret: {} as never,
    })).rejects.toThrow()
  })
})
