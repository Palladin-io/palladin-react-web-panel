import { useCallback, useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react'
import { create } from 'zustand'
import type { MemberEntryState } from './sync/member-sync-store'

/**
 * Ephemeral, per-vault UI state for the entries list (search text, lifecycle
 * filter, and scroll position). The vault-detail list and the entry-detail split-view list are two
 * separate component instances, so navigating from the list into an entry (or
 * between the two surfaces) would otherwise reset the search box and scroll
 * position. Persisting them here — keyed by vault — keeps the list exactly where
 * the user left it when they select an entry.
 *
 * In-memory only — this is transient UI state, never written to storage.
 */
interface EntriesListUiState {
  search: Record<string, string>
  scrollTop: Record<string, number>
  lifecycleState: Record<string, MemberEntryState>
  setSearch: (vaultId: string, search: string) => void
  setScrollTop: (vaultId: string, scrollTop: number) => void
  setLifecycleState: (vaultId: string, state: MemberEntryState) => void
}

export const useEntriesListUi = create<EntriesListUiState>((set) => ({
  search: {},
  scrollTop: {},
  lifecycleState: {},
  setSearch: (vaultId, search) =>
    set((s) => ({ search: { ...s.search, [vaultId]: search } })),
  setScrollTop: (vaultId, scrollTop) =>
    set((s) => ({ scrollTop: { ...s.scrollTop, [vaultId]: scrollTop } })),
  setLifecycleState: (vaultId, lifecycleState) =>
    set((s) => ({ lifecycleState: { ...s.lifecycleState, [vaultId]: lifecycleState } })),
}))

export interface PersistedEntriesList {
  search: string
  setSearch: (search: string) => void
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  lifecycleState: MemberEntryState
  setLifecycleState: (state: MemberEntryState) => void
}

/**
 * Wire an entries list to the persisted per-vault UI state: the search text is
 * read/written from the store, and the scroll position is saved on scroll and
 * restored once the list content is present (`ready`). Both the vault-detail
 * list and the split-view panel use this, so selecting an entry (or moving
 * between the two surfaces) keeps the list exactly where it was.
 */
export function usePersistedEntriesList(vaultId: string, ready: boolean): PersistedEntriesList {
  const search = useEntriesListUi((s) => s.search[vaultId] ?? '')
  const setSearchRaw = useEntriesListUi((s) => s.setSearch)
  const setScrollTop = useEntriesListUi((s) => s.setScrollTop)
  const lifecycleState = useEntriesListUi((s) => s.lifecycleState[vaultId] ?? 'active')
  const setLifecycleStateRaw = useEntriesListUi((s) => s.setLifecycleState)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const restored = useRef(false)

  // Restore scroll once the content is rendered (warm query cache on remount),
  // so the row the user left off at is exactly where it was.
  useLayoutEffect(() => {
    if (restored.current || !ready || !scrollRef.current) return
    const top = useEntriesListUi.getState().scrollTop[vaultId] ?? 0
    if (top > 0) scrollRef.current.scrollTop = top
    restored.current = true
  })

  const setSearch = useCallback((value: string) => setSearchRaw(vaultId, value), [vaultId, setSearchRaw])
  const setLifecycleState = useCallback(
    (value: MemberEntryState) => setLifecycleStateRaw(vaultId, value),
    [vaultId, setLifecycleStateRaw],
  )
  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => setScrollTop(vaultId, e.currentTarget.scrollTop),
    [vaultId, setScrollTop],
  )

  return { search, setSearch, scrollRef, onScroll, lifecycleState, setLifecycleState }
}
