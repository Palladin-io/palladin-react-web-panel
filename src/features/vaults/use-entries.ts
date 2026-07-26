import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getAllEntries, getCanonicalEntry, getEntries, getEntry } from './api/vault-api'

export function entriesQueryKey(vaultId: string) {
  return ['vaults', vaultId, 'entries'] as const
}

export function allEntriesQueryKey(vaultId: string) {
  return ['vaults', vaultId, 'entries', 'all'] as const
}

export function entryDetailQueryKey(vaultId: string, entryId: string) {
  return ['vaults', vaultId, 'entries', entryId] as const
}

/**
 * Cursor-paginated, metadata-only entry list for a vault — the list UI follows
 * `nextCursor` via "Load more" so vaults larger than one page render fully. The
 * encrypted blob is omitted; see {@link useEntryDetail} for the lazy single-entry
 * fetch used by the reveal panel. For the COMPLETE set in one shot (export,
 * conflict detection) use {@link useAllEntries} / `getAllEntries`.
 */
export function useEntriesInfinite(vaultId: string) {
  return useInfiniteQuery({
    queryKey: entriesQueryKey(vaultId),
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
  return useQuery({
    queryKey: allEntriesQueryKey(vaultId),
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
  return useQuery({
    queryKey: entryDetailQueryKey(vaultId, entryId),
    queryFn: () => getEntry(vaultId, entryId),
    enabled,
    // Reveal-only — keep the blob in cache for the rest of the session
    // so toggling visibility doesn't refetch. Closing the tab still
    // wipes everything because TanStack Query lives in-memory only.
    staleTime: Infinity,
  })
}

export function useCanonicalEntryDetail(vaultId: string, entryId: string, enabled = true) {
  return useQuery({
    queryKey: [...entryDetailQueryKey(vaultId, entryId), 'canonical'] as const,
    queryFn: () => getCanonicalEntry(vaultId, entryId),
    enabled,
    staleTime: Infinity,
  })
}
