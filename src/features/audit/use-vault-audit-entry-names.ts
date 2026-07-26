import { useCallback, useMemo } from 'react'
import { shortenKey } from '../../shared/lib/shorten-key'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import type { AuditLogItem } from './api/audit-api'

/** Resolve opaque audit entry ids from the unlocked, in-memory member index. */
export function useVaultAuditEntryNames(vaultId: string, items: AuditLogItem[]) {
  const vault = useMemberSyncStore((state) => state.vaults.get(vaultId))

  const entryNameById = useMemo(() => {
    const names: Record<string, string> = {}
    for (const item of items) {
      if (!item.entryId) continue
      const record = vault?.entries.get(item.entryId)
      if (!record?.corrupt && record?.payload?.memberLabel) {
        names[item.entryId] = record.payload.memberLabel
      }
    }
    return names
  }, [items, vault])

  const resolveEntryName = useCallback(
    (entryId: string) => entryNameById[entryId] ?? shortenKey(entryId),
    [entryNameById],
  )

  return { entryNameById, resolveEntryName }
}
