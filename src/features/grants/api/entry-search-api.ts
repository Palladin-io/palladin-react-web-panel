
/**
 * Flat cross-vault entry search — `GET /api/entries?query=&limit=&sort=`. Used by
 * the proactive grant dialog (target-for-agent → Entry mode) to pick an entry
 * across every vault the caller can see, and by the dashboard "Recently added /
 * modified" widget (`sort=recent`). No secrets are returned — metadata only.
 *
 * Backend contract (Vault module — SearchOrganizationEntries):
 *   { items: [{ id, label, vaultId, vaultName, type, icon, updatedAt, createdAt }] }
 * Each item is parsed leniently so a malformed row is skipped rather than
 * collapsing the whole result set.
 */
export interface EntrySearchItem {
  id: string
  label: string
  vaultId: string
  vaultName?: string | null
  // type/icon are display-only and may be absent; tolerate anything.
  type?: unknown
  icon?: string | null
  // Timestamps (ISO) drive the "Recently added / modified" widget; optional so
  // the grant-picker path tolerates a backend that omits them.
  updatedAt?: string | null
  createdAt?: string | null
}

/** Server-side ordering. `label` (default) = alphabetical; `recent` = updatedAt desc. */
export type EntrySort = 'label' | 'recent'

export async function searchEntries(
  _query: string,
  _limit = 20,
  _sort: EntrySort = 'label',
): Promise<EntrySearchItem[]> {
  void _query
  void _limit
  void _sort
  // The legacy endpoint exposes and searches plaintext Entry metadata.
  // Vault v2 callers must build their picker from locally decrypted indexes.
  return []
}
