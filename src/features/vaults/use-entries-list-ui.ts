import { useCallback, useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react'
import { create } from 'zustand'

/**
 * Ephemeral, per-vault UI state for the entries list (search text + scroll
 * position). The vault-detail list and the entry-detail split-view list are two
 * separate component instances, so navigating from the list into an entry (or
 * between the two surfaces) would otherwise reset the search box and scroll
 * position. Persisting them here — keyed by vault — keeps the list exactly where
 * the user left it when they select an entry (CVT-204).
 *
 * The loaded infinite-scroll pages survive on their own via the TanStack Query
 * cache (keyed by vault), so only the search text and scrollTop need holding.
 * In-memory only — this is transient UI state, never written to storage.
 */
interface EntriesListUiState {
  search: Record<string, string>
  scrollTop: Record<string, number>
  setSearch: (vaultId: string, search: string) => void
  setScrollTop: (vaultId: string, scrollTop: number) => void
}

export const useEntriesListUi = create<EntriesListUiState>((set) => ({
  search: {},
  scrollTop: {},
  setSearch: (vaultId, search) =>
    set((s) => ({ search: { ...s.search, [vaultId]: search } })),
  setScrollTop: (vaultId, scrollTop) =>
    set((s) => ({ scrollTop: { ...s.scrollTop, [vaultId]: scrollTop } })),
}))

export interface PersistedEntriesList {
  search: string
  setSearch: (search: string) => void
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
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
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const restored = useRef(false)

  // Restore scroll once the content is rendered (warm query cache on remount),
  // so the row the user left off at is exactly where it was.
  useLayoutEffect(() => {
    if (restored.current || !ready || !scrollRef.current) return
    const top = useEntriesListUi.getState().scrollTop[vaultId] ?? 0
    if (top > 0) scrollRef.current.scrollTop = top
    restored.current = true
  }, [ready, vaultId])

  const setSearch = useCallback((value: string) => setSearchRaw(vaultId, value), [vaultId, setSearchRaw])
  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => setScrollTop(vaultId, e.currentTarget.scrollTop),
    [vaultId, setScrollTop],
  )

  return { search, setSearch, scrollRef, onScroll }
}
