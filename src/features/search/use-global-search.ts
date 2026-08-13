import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../auth'
import { useMemberSyncStore, type MemberIndexRecord } from '../vaults/sync/member-sync-store'
import { getAdministrativeSearch, type RemoteSearchResult } from './search-api'
import { memberIndexSearchValues, presentationIconReference } from '../../shared/crypto/vault-plaintext'

const MIN_QUERY_LENGTH = 2
const MAXIMUM_QUERY_LENGTH = 128
const LOCAL_RESULT_LIMIT = 8
const REMOTE_RESULT_LIMIT = 8
const RECENT_RESULT_LIMIT = 5

export type SearchResultItem =
  | { type: 'agent'; id: string; name: string }
  | { type: 'member'; id: string; name: string }
  | { type: 'vault'; id: string; name: string; icon?: string; color?: string }
  | {
      type: 'entry'
      id: string
      vaultId: string
      name: string
      vaultName: string
      entryType: 'key' | 'credential' | 'script'
      icon?: string
      color?: string
    }

export type SearchResultType = SearchResultItem['type']

interface LocalCandidate {
  result: SearchResultItem
  fields: readonly string[]
}

function normalized(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase()
}

function matchRank(fields: readonly string[], query: string): number | null {
  let rank: number | null = null
  for (const field of fields) {
    const value = normalized(field)
    const next = value === query ? 0 : value.startsWith(query) ? 1 : value.includes(query) ? 2 : null
    if (next !== null && (rank === null || next < rank)) rank = next
  }
  return rank
}

function resultIdentity(result: SearchResultItem): string {
  return result.type === 'entry'
    ? `entry:${result.vaultId}:${result.id}`
    : `${result.type}:${result.id}`
}

function displayIcon(reference: string | undefined): string | undefined {
  if (!reference) return undefined
  if (reference.startsWith('builtin:')) return reference.slice('builtin:'.length) || undefined
  if (reference.startsWith('public-asset:')) return reference
  if (reference.startsWith('vault-asset:')) return reference
  return undefined
}

function localCandidates(vaults: ReturnType<typeof useMemberSyncStore.getState>['vaults']): LocalCandidate[] {
  const candidates: LocalCandidate[] = []
  for (const [vaultId, vault] of vaults) {
    if (vault.status !== 'ready' || !vault.metadata) continue
    const vaultIcon = displayIcon(presentationIconReference(vault.metadata.icon))
    candidates.push({
      result: {
        type: 'vault',
        id: vaultId,
        name: vault.metadata.name,
        ...(vaultIcon ? { icon: vaultIcon } : {}),
        ...(vault.metadata.color ? { color: vault.metadata.color } : {}),
      },
      fields: [vault.metadata.name, vault.metadata.description ?? ''],
    })
    for (const entry of vault.entries.values()) {
      if (entry.state !== 'active' || entry.corrupt || !entry.payload) continue
      const entryIcon = displayIcon(presentationIconReference(entry.payload.icon))
      candidates.push({
        result: {
          type: 'entry',
          id: entry.entryId,
          vaultId,
          name: entry.payload.memberLabel,
          vaultName: vault.metadata.name,
          entryType: entry.payload.entryType,
          ...(entryIcon ? { icon: entryIcon } : {}),
          ...(entry.payload.color ? { color: entry.payload.color } : {}),
        },
        fields: memberIndexSearchValues(entry.payload),
      })
    }
  }
  return candidates
}

export function searchLocalVaults(
  vaults: ReturnType<typeof useMemberSyncStore.getState>['vaults'],
  query: string,
  limit = LOCAL_RESULT_LIMIT,
): SearchResultItem[] {
  const needle = normalized(query.trim())
  if (needle.length < MIN_QUERY_LENGTH || needle.length > MAXIMUM_QUERY_LENGTH) return []
  return localCandidates(vaults)
    .map((candidate) => ({ candidate, rank: matchRank(candidate.fields, needle) }))
    .filter((item): item is { candidate: LocalCandidate; rank: number } => item.rank !== null)
    .sort((left, right) => left.rank - right.rank
      || left.candidate.result.name.localeCompare(right.candidate.result.name, undefined, { sensitivity: 'base' })
      || resultIdentity(left.candidate.result).localeCompare(resultIdentity(right.candidate.result)))
    .slice(0, limit)
    .map((item) => item.candidate.result)
}

export function recentLocalEntries(
  vaults: ReturnType<typeof useMemberSyncStore.getState>['vaults'],
  limit = RECENT_RESULT_LIMIT,
): SearchResultItem[] {
  const rows: Array<{ record: MemberIndexRecord; result: Extract<SearchResultItem, { type: 'entry' }> }> = []
  for (const [vaultId, vault] of vaults) {
    if (vault.status !== 'ready' || !vault.metadata) continue
    for (const record of vault.entries.values()) {
      if (record.state !== 'active' || record.corrupt || !record.payload) continue
      const entryIcon = displayIcon(presentationIconReference(record.payload.icon))
      rows.push({
        record,
        result: {
          type: 'entry', id: record.entryId, vaultId,
          name: record.payload.memberLabel, vaultName: vault.metadata.name,
          entryType: record.payload.entryType,
          ...(entryIcon ? { icon: entryIcon } : {}),
          ...(record.payload.color ? { color: record.payload.color } : {}),
        },
      })
    }
  }
  return rows
    .sort((left, right) => right.record.updatedAt.localeCompare(left.record.updatedAt)
      || left.result.vaultId.localeCompare(right.result.vaultId)
      || left.result.id.localeCompare(right.result.id))
    .slice(0, limit)
    .map((item) => item.result)
}

function mergeResults(local: SearchResultItem[], remote: RemoteSearchResult[]): SearchResultItem[] {
  const seen = new Set<string>()
  const merged: SearchResultItem[] = []
  for (const item of [...local, ...remote]) {
    const identity = resultIdentity(item)
    if (seen.has(identity)) continue
    seen.add(identity)
    merged.push(item)
  }
  return merged
}

/** Mixed search without query retention: local results are synchronous; the
 * remote request is abortable and its response lives only in hook state. */
export function useGlobalSearch(query: string) {
  const unlocked = useAuthStore((state) => state.privateKey !== null)
  const vaults = useMemberSyncStore((state) => state.vaults)
  const syncStatus = useMemberSyncStore((state) => state.status)
  const trimmed = query.trim()
  const enabled = unlocked && trimmed.length >= MIN_QUERY_LENGTH && trimmed.length <= MAXIMUM_QUERY_LENGTH
  const local = useMemo(
    () => enabled ? searchLocalVaults(vaults, trimmed) : [],
    [enabled, trimmed, vaults],
  )
  const [remoteState, setRemoteState] = useState<{
    query: string
    status: 'idle' | 'loading' | 'success' | 'error'
    results: RemoteSearchResult[]
  }>({ query: '', status: 'idle', results: [] })
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    if (!enabled) {
      queueMicrotask(() => {
        if (current === generation.current) setRemoteState({ query: '', status: 'idle', results: [] })
      })
      return undefined
    }
    const controller = new AbortController()
    queueMicrotask(() => {
      if (current === generation.current && !controller.signal.aborted) {
        setRemoteState({ query: trimmed, status: 'loading', results: [] })
      }
    })
    void getAdministrativeSearch(trimmed, controller.signal, REMOTE_RESULT_LIMIT).then(
      (results) => {
        if (current !== generation.current || controller.signal.aborted) return
        setRemoteState({ query: trimmed, status: 'success', results })
      },
      () => {
        if (current !== generation.current || controller.signal.aborted) return
        setRemoteState({ query: trimmed, status: 'error', results: [] })
      },
    )
    return () => controller.abort()
  }, [enabled, trimmed])

  const currentRemote = enabled && remoteState.query === trimmed ? remoteState : null

  return {
    data: mergeResults(local, currentRemote?.results ?? []),
    local,
    isRemoteLoading: enabled && (currentRemote === null || currentRemote.status === 'loading'),
    isRemoteError: currentRemote?.status === 'error',
    isLocked: !unlocked,
    isSyncing: unlocked && syncStatus !== 'ready',
  }
}

export function useRecentLocalEntries(limit = RECENT_RESULT_LIMIT) {
  const unlocked = useAuthStore((state) => state.privateKey !== null)
  const vaults = useMemberSyncStore((state) => state.vaults)
  return useMemo(() => unlocked ? recentLocalEntries(vaults, limit) : [], [limit, unlocked, vaults])
}
