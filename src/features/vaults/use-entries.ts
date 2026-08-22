import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey, useAuthStore } from '../auth'
import { getAllEntries, getCanonicalEntry, getEntries, getEntry, getEntryHistory } from './api/vault-api'

export function entriesQueryKey(vaultId: string) {
  return ['vaults', vaultId, 'entries'] as const
}

export function allEntriesQueryKey(vaultId: string) {
  return ['vaults', vaultId, 'entries', 'all'] as const
}

export function entryDetailQueryKey(vaultId: string, entryId: string) {
  return ['vaults', vaultId, 'entries', entryId] as const
}

export function entryHistoryQueryKey(vaultId: string, entryId: string) {
  return [...entryDetailQueryKey(vaultId, entryId), 'history'] as const
}

export function canonicalEntryDetailQueryKey(
  vaultId: string,
  entryId: string,
  cryptoSessionGeneration: number,
) {
  return [
    ...entryDetailQueryKey(vaultId, entryId),
    'canonical',
    cryptoSessionGeneration,
  ] as const
}

export function useEntryHistory(vaultId: string, entryId: string, enabled: boolean) {
  const queryKey = useAuthenticatedQueryKey(entryHistoryQueryKey(vaultId, entryId))
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getEntryHistory(vaultId, entryId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBeforeRevision ?? undefined,
    enabled,
    staleTime: 30_000,
  })
}

/**
 * Cursor-paginated, metadata-only entry list for a vault — the list UI follows
 * `nextCursor` via "Load more" so vaults larger than one page render fully. The
 * encrypted blob is omitted; see {@link useEntryDetail} for the lazy single-entry
 * fetch used by the reveal panel. For the COMPLETE set in one shot (export,
 * conflict detection) use {@link useAllEntries} / `getAllEntries`.
 */
export function useEntriesInfinite(vaultId: string) {
  const queryKey = useAuthenticatedQueryKey(entriesQueryKey(vaultId))
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getEntries(vaultId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  })
}

/**
 * Fetch the COMPLETE entry list (all pages) for a vault. Used by the import
 * wizard to detect label conflicts against every existing entry, not just the
 * first page. Kept under a distinct key so it doesn't clash with the paged
 * {@link useEntries} cache.
 */
export function useAllEntries(vaultId: string, enabled = true) {
  const queryKey = useAuthenticatedQueryKey(allEntriesQueryKey(vaultId))
  return useQuery({
    queryKey,
    queryFn: () => getAllEntries(vaultId),
    enabled,
    staleTime: 30_000,
  })
}

/**
 * Lazy-fetch a single entry with its encrypted blob. Disabled by
 * default — components opt in by passing `enabled: true` once the user
 * actually clicks "reveal", so we never preload secret bytes for entries
 * the user is just scrolling past.
 */
export function useEntryDetail(
  vaultId: string,
  entryId: string,
  enabled: boolean,
) {
  const queryKey = useAuthenticatedQueryKey(entryDetailQueryKey(vaultId, entryId))
  return useQuery({
    queryKey,
    queryFn: () => getEntry(vaultId, entryId),
    enabled,
    // Reveal-only — keep the blob in cache for the rest of the session
    // so toggling visibility doesn't refetch. Closing the tab still
    // wipes everything because TanStack Query lives in-memory only.
    staleTime: Infinity,
  })
}

export function useCanonicalEntryDetail(vaultId: string, entryId: string, enabled = true) {
  const cryptoSessionGeneration = useAuthStore(
    (state) => state.cryptoSessionGeneration,
  )
  const queryKey = useAuthenticatedQueryKey(canonicalEntryDetailQueryKey(
    vaultId,
    entryId,
    cryptoSessionGeneration,
  ))
  return useQuery({
    queryKey,
    queryFn: () => getCanonicalEntry(vaultId, entryId),
    enabled,
    staleTime: Infinity,
  })
}
