import { useQuery } from '@tanstack/react-query'
import { getAllEntries, getEntries, getEntry } from './api/vault-api'

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
 * Fetch the metadata-only entry list for a vault. The encrypted blob
 * is intentionally omitted — see {@link useEntryDetail} for the lazy
 * single-entry fetch used by the reveal panel.
 */
export function useEntries(vaultId: string) {
  return useQuery({
    queryKey: entriesQueryKey(vaultId),
    queryFn: () => getEntries(vaultId),
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
