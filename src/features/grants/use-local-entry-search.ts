import { useMemo } from 'react'
import { useMemberSyncStore } from '../../shared/stores/member-sync-store'
import { memberIndexSearchValues, presentationIconReference } from '../../shared/crypto/vault-plaintext'
import { normalizeEntryType } from '../../shared/types/entry-type'

/** Decrypted in-memory Entry presentation used by cross-Vault pickers and
 * recents. This projection is never fetched from or sent to the backend. */
export interface EntrySearchItem {
  id: string
  label: string
  vaultId: string
  vaultName: string
  type: number
  icon?: string
  updatedAt: string
}

export type EntrySort = 'label' | 'recent'

function builtinIcon(reference: string | undefined): string | undefined {
  if (!reference?.startsWith('builtin:')) return undefined
  return reference.slice('builtin:'.length) || undefined
}

export function useLocalEntrySearch(
  query: string,
  limit = 20,
  sort: EntrySort = 'label',
  enabled = true,
): EntrySearchItem[] {
  const vaults = useMemberSyncStore((state) => state.vaults)
  const needle = query.normalize('NFC').trim().toLocaleLowerCase()
  return useMemo(() => {
    if (!enabled || limit <= 0) return []
    const entries: EntrySearchItem[] = []
    for (const [vaultId, vault] of vaults) {
      if (vault.status !== 'ready' || !vault.metadata) continue
      for (const record of vault.entries.values()) {
        if (record.state !== 'active' || record.corrupt || !record.payload) continue
        const fields = memberIndexSearchValues(record.payload)
        if (needle && !fields.some((field) => field.normalize('NFC').toLocaleLowerCase().includes(needle))) continue
        const icon = builtinIcon(presentationIconReference(record.payload.icon))
        entries.push({
          id: record.entryId,
          label: record.payload.memberLabel,
          vaultId,
          vaultName: vault.metadata.name,
          type: normalizeEntryType(record.payload.entryType),
          ...(icon ? { icon } : {}),
          updatedAt: record.updatedAt,
        })
      }
    }
    entries.sort((left, right) => sort === 'recent'
      ? right.updatedAt.localeCompare(left.updatedAt)
        || left.vaultId.localeCompare(right.vaultId)
        || left.id.localeCompare(right.id)
      : left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
        || left.vaultId.localeCompare(right.vaultId)
        || left.id.localeCompare(right.id))
    return entries.slice(0, Math.min(limit, 100))
  }, [enabled, limit, needle, sort, vaults])
}
