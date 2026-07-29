import { useDeferredValue, useMemo } from 'react'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { memberIndexSearchValues, presentationIconReference } from '../../../shared/crypto/vault-plaintext'
import type { EntryType } from '../types'
import { normalizeEntryType } from '../types'
import {
  useMemberSyncStore,
  type DecryptedMemberVault,
  type MemberEntryState,
  type MemberSyncStatus,
} from './member-sync-store'

export type MemberEntrySort = 'name-asc' | 'name-desc' | 'type'

export interface MemberEntryListItem {
  id: string
  state: MemberEntryState
  label: string
  type: EntryType
  icon: string | null
  username: string | null
  urlDomain: string | null
  searchFields: readonly string[]
  currentRevision: string
  corrupt: boolean
}

function materialIconReference(reference: string | undefined): string | null {
  if (!reference) return null
  if (reference.startsWith('builtin:')) return reference.slice('builtin:'.length) || null
  if (reference.startsWith('public-asset:') || reference.startsWith('website:')) return reference
  return reference.includes(':') ? null : reference
}

export function buildMemberEntryList(vault: DecryptedMemberVault | undefined): MemberEntryListItem[] {
  if (!vault) return []
  return Array.from(vault.entries.values(), (entry) => ({
    id: entry.entryId,
    state: entry.state,
    label:
      !entry.corrupt && entry.payload?.memberLabel
        ? entry.payload.memberLabel
        : shortenKey(entry.entryId),
    type: normalizeEntryType(entry.payload?.entryType),
    icon: !entry.corrupt
      ? materialIconReference(presentationIconReference(entry.payload?.icon ?? null))
        ?? (entry.payload?.urlDomain ? `website:${entry.payload.urlDomain}` : null)
      : null,
    username: !entry.corrupt ? entry.payload?.username ?? null : null,
    urlDomain: !entry.corrupt ? entry.payload?.urlDomain ?? null : null,
    searchFields: !entry.corrupt && entry.payload ? memberIndexSearchValues(entry.payload) : [],
    currentRevision: entry.currentRevision,
    corrupt: entry.corrupt || entry.payload === null,
  }))
}

export function filterAndSortMemberEntries(
  items: readonly MemberEntryListItem[],
  states: ReadonlySet<MemberEntryState> | MemberEntryState,
  query: string,
  sort: MemberEntrySort,
): MemberEntryListItem[] {
  const selectedStates = typeof states === 'string' ? new Set([states]) : states
  const normalized = query.normalize('NFC').trim().toLocaleLowerCase()
  const filtered = items.filter((entry) => {
    if (!selectedStates.has(entry.state)) return false
    if (!normalized) return true
    return [entry.label, ...entry.searchFields]
      .some((value) => value.normalize('NFC').toLocaleLowerCase().includes(normalized))
  })
  return filtered.sort((left, right) => {
    if (sort === 'type') {
      return left.type - right.type || left.label.localeCompare(right.label)
    }
    const order = left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    return sort === 'name-desc' ? -order : order
  })
}

export function useMemberEntryList(
  vaultId: string,
  states: ReadonlySet<MemberEntryState>,
  query: string,
  sort: MemberEntrySort,
): {
  status: MemberSyncStatus
  vaultStatus: DecryptedMemberVault['status'] | null
  failureKind: DecryptedMemberVault['failureKind'] | null
  items: MemberEntryListItem[]
  counts: Record<MemberEntryState, number>
  retry: () => void
} {
  const status = useMemberSyncStore((store) => store.status)
  const vault = useMemberSyncStore((store) => store.vaults.get(vaultId))
  const retry = useMemberSyncStore((store) => store.retry)
  const deferredQuery = useDeferredValue(query)
  const allItems = useMemo(() => buildMemberEntryList(vault), [vault])
  const counts = useMemo(() => allItems.reduce<Record<MemberEntryState, number>>(
    (result, entry) => {
      result[entry.state] += 1
      return result
    },
    { active: 0, archived: 0, deleted: 0 },
  ), [allItems])
  const items = useMemo(
    () => filterAndSortMemberEntries(allItems, states, deferredQuery, sort),
    [allItems, states, deferredQuery, sort],
  )
  return {
    status,
    vaultStatus: vault?.status ?? null,
    failureKind: vault?.failureKind ?? null,
    items,
    counts,
    retry,
  }
}
