import { z } from 'zod'
import { api } from '../../../shared/api/client'

/**
 * Flat cross-vault entry search — `GET /api/entries?query=&limit=`. Used only by
 * the proactive grant dialog (target-for-agent → Entry mode) to pick an entry
 * across every vault the caller can see. No secrets are returned — metadata only.
 *
 * Backend contract (assumed; implemented in parallel):
 *   { items: [{ id, label, vaultId, vaultName, type, icon }] }
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
})

export type EntrySearchItem = z.infer<typeof entrySearchItemSchema>

const entrySearchPageSchema = z.object({ items: z.array(z.unknown()) })

export async function searchEntries(
  query: string,
  limit = 20,
): Promise<EntrySearchItem[]> {
  const searchParams = new URLSearchParams({ query, limit: String(limit) })
  const raw = await api.get('api/entries', { searchParams }).json()
  const page = entrySearchPageSchema.parse(raw)

  const items: EntrySearchItem[] = []
  for (const item of page.items) {
    const result = entrySearchItemSchema.safeParse(item)
    if (result.success) items.push(result.data)
  }
  return items
}
