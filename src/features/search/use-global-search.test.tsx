import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useLocalEntrySearch } from '../grants/use-local-entry-search'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import {
  recentLocalEntries,
  searchLocalVaults,
  useGlobalSearch,
  type SearchResultItem,
} from './use-global-search'

const getRemote = vi.hoisted(() => vi.fn())
vi.mock('./search-api', () => ({ getAdministrativeSearch: getRemote }))

const agent = (id: string, name: string): SearchResultItem => ({ type: 'agent', id, name })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function publishVault() {
  const index = (
    memberLabel: string,
    username: string,
    entryType: 'key' | 'credential',
    icon: null | { kind: 'glyph'; value: string } | {
      kind: 'publicAsset'
      assetId: string
      revision: number
      url: string
    } = null,
  ) => ({
    schema: 'palladin.member-index.v1' as const,
    entryType,
    memberLabel,
    description: null,
    icon,
    color: '#60A5FA',
    username,
    urlDomain: null,
    customIndex: [],
  })
  useMemberSyncStore.setState({
    status: 'ready',
    vaults: new Map([['vault-b', {
      vaultId: 'vault-b',
      metadata: {
        name: 'Production',
        description: 'Infrastructure',
        icon: { kind: 'glyph', value: 'database' },
        color: '#10B981',
      },
      structure: {},
      entries: new Map([
        ['entry-a', {
          entryId: 'entry-a', state: 'active', updatedAt: '2026-07-26T12:00:00Z',
          currentRevision: '2', memberIndexRevision: '2', currentKeyVersion: 1,
          payload: index('GitHub', 'octocat', 'credential', {
            kind: 'publicAsset',
            assetId: '11111111-1111-4111-8111-111111111111',
            revision: 2,
            url: 'https://assets.palladin.io/github.png',
          }), corrupt: false,
        }],
        ['entry-b', {
          entryId: 'entry-b', state: 'active', updatedAt: '2026-07-26T13:00:00Z',
          currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1,
          payload: index('Deploy Key', 'github', 'key', { kind: 'glyph', value: 'vpn_key' }), corrupt: false,
        }],
        ['entry-corrupt', {
          entryId: 'entry-corrupt', state: 'active', updatedAt: '2026-07-26T14:00:00Z',
          currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1,
          payload: null, corrupt: true,
        }],
      ]),
      appliedThroughSequence: '3', status: 'ready', failureKind: null,
    } as never]]),
    error: null,
  })
}

describe('local global-search providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3) })
    useMemberSyncStore.getState().clear()
    publishVault()
  })

  it('matches only decrypted local Vault and active non-corrupt Entry projections deterministically', () => {
    const vaults = useMemberSyncStore.getState().vaults
    expect(searchLocalVaults(vaults, 'prod')).toEqual([
      {
        type: 'vault', id: 'vault-b', name: 'Production',
        icon: 'database', color: '#10B981',
      },
    ])
    expect(searchLocalVaults(vaults, 'github')).toEqual([
      expect.objectContaining({
        type: 'entry', id: 'entry-b', vaultId: 'vault-b',
        entryType: 'key', icon: 'vpn_key', color: '#60A5FA',
      }),
      expect.objectContaining({
        type: 'entry', id: 'entry-a', vaultId: 'vault-b',
        entryType: 'credential',
        icon: 'public-asset:11111111-1111-4111-8111-111111111111|2|https%3A%2F%2Fassets.palladin.io%2Fgithub.png',
        color: '#60A5FA',
      }),
    ])
    expect(searchLocalVaults(vaults, 'corrupt')).toEqual([])
  })

  it('derives bounded recents from structural synchronized timestamps', () => {
    expect(recentLocalEntries(useMemberSyncStore.getState().vaults, 1)).toEqual([
      expect.objectContaining({
        type: 'entry', id: 'entry-b', vaultId: 'vault-b',
        entryType: 'key', icon: 'vpn_key', color: '#60A5FA',
      }),
    ])
  })

  it('keeps cross-Vault grant picking and dashboard recents on the same local index', () => {
    const search = renderHook(() => useLocalEntrySearch('github', 20, 'label')).result
    expect(search.current.map((item) => item.id)).toEqual(['entry-b', 'entry-a'])
    const recent = renderHook(() => useLocalEntrySearch('', 1, 'recent')).result
    expect(recent.current.map((item) => item.id)).toEqual(['entry-b'])
  })

  it('ignores stale remote responses and clears all results immediately on lock', async () => {
    const first = deferred<SearchResultItem[]>()
    const second = deferred<SearchResultItem[]>()
    getRemote.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ query }) => useGlobalSearch(query), {
      initialProps: { query: 'alpha' },
    })
    rerender({ query: 'beta' })
    await act(async () => second.resolve([agent('22222222-2222-4222-8222-222222222222', 'Beta')]))
    await waitFor(() => expect(result.current.data).toEqual([
      agent('22222222-2222-4222-8222-222222222222', 'Beta'),
    ]))
    await act(async () => first.resolve([agent('11111111-1111-4111-8111-111111111111', 'Alpha')]))
    expect(result.current.data).toEqual([agent('22222222-2222-4222-8222-222222222222', 'Beta')])

    act(() => useAuthStore.setState({ privateKey: null }))
    await waitFor(() => expect(result.current.data).toEqual([]))
    expect(result.current.isLocked).toBe(true)
  })

  it('deduplicates by type plus complete composite navigation identity', async () => {
    useMemberSyncStore.getState().publishVault({
      vaultId: 'vault-a', metadata: { name: 'Personal' }, structure: {},
      entries: new Map([['entry-a', {
        entryId: 'entry-a', state: 'active', updatedAt: '2026-07-26T11:00:00Z',
        currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1,
        payload: {
          schema: 'palladin.member-index.v1', entryType: 'credential', memberLabel: 'GitHub copy',
          description: null, icon: null, color: null, username: null, urlDomain: null, customIndex: [],
        }, corrupt: false,
      }]]),
      appliedThroughSequence: '1', status: 'ready', failureKind: null,
    } as never)
    getRemote.mockResolvedValue([agent('entry-a', 'GitHub Agent')])
    const { result } = renderHook(() => useGlobalSearch('github'))
    await waitFor(() => expect(result.current.isRemoteLoading).toBe(false))
    expect(result.current.data.filter((item) => item.type === 'entry' && item.id === 'entry-a')).toHaveLength(2)
    expect(result.current.data).toContainEqual(agent('entry-a', 'GitHub Agent'))
  })

  it('keeps local results usable when the ephemeral administrative request fails', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getRemote.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useGlobalSearch('github'))
    await waitFor(() => expect(result.current.isRemoteError).toBe(true))
    expect(result.current.data).toEqual([
      expect.objectContaining({ type: 'entry', id: 'entry-b' }),
      expect.objectContaining({ type: 'entry', id: 'entry-a' }),
    ])
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    log.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })
})
