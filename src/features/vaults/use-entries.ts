import { useQuery } from '@tanstack/react-query'
import { getEntries, getEntry } from './api/vault-api'

export function entriesQueryKey(vaultId: string) {
  return ['vaults', vaultId, 'entries'] as const
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
