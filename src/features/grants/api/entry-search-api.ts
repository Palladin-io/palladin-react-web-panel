import { z } from 'zod'
import { api } from '../../../shared/api/client'

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
const entrySearchItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  vaultId: z.string(),
  vaultName: z.string().nullable().optional(),
  // type/icon are display-only and may be absent; tolerate anything.
  type: z.unknown().optional(),
  icon: z.string().nullable().optional(),
  // Timestamps (ISO) drive the "Recently added / modified" widget; optional so
  // the grant-picker path tolerates a backend that omits them.
  updatedAt: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
})

export type EntrySearchItem = z.infer<typeof entrySearchItemSchema>

/** Server-side ordering. `label` (default) = alphabetical; `recent` = updatedAt desc. */
export type EntrySort = 'label' | 'recent'

const entrySearchPageSchema = z.object({ items: z.array(z.unknown()) })

export async function searchEntries(
  query: string,
  limit = 20,
  sort: EntrySort = 'label',
): Promise<EntrySearchItem[]> {
  const searchParams = new URLSearchParams({
    query,
    limit: String(limit),
    sort,
  })
  const raw = await api.get('api/entries', { searchParams }).json()
  const page = entrySearchPageSchema.parse(raw)

  const items: EntrySearchItem[] = []
  for (const item of page.items) {
    const result = entrySearchItemSchema.safeParse(item)
    if (result.success) items.push(result.data)
  }
  return items
}
