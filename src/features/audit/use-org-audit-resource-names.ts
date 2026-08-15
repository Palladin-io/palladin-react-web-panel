import { useCallback, useMemo } from 'react'
import { shortenKey } from '../../shared/lib/shorten-key'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import type { AuditLogItem } from './api/audit-api'
import type { AuditFilterOption } from './components/audit-filter-bar'

export interface OrgAuditResourceNames {
  entryNameById: Record<string, string>
  vaultNameById: Record<string, string>
  vaultOptions: AuditFilterOption[]
  resolveEntryName: (entryId: string) => string
  resolveVaultName: (vaultId: string) => string
}

/** Keep decrypted Vault/Entry labels client-side while org audit filters stay opaque. */
export function useOrgAuditResourceNames(
  items: ReadonlyArray<Pick<AuditLogItem, 'entryId' | 'vaultId'>>,
): OrgAuditResourceNames {
  const memberVaults = useMemberSyncStore((state) => state.vaults)

  const vaultOptions = useMemo(
    () => [...memberVaults.values()].map((vault) => ({
      value: vault.vaultId,
      label: vault.metadata?.name ?? shortenKey(vault.vaultId),
    })),
    [memberVaults],
  )

  const { entryNameById, vaultNameById } = useMemo(() => {
    const entryNames: Record<string, string> = {}
    const vaultNames: Record<string, string> = {}

    for (const item of items) {
      if (item.vaultId) {
        const vault = memberVaults.get(item.vaultId)
        vaultNames[item.vaultId] = vault?.metadata?.name ?? shortenKey(item.vaultId)

        if (item.entryId) {
          const record = vault?.entries.get(item.entryId)
          entryNames[item.entryId] = !record?.corrupt && record?.payload?.memberLabel
            ? record.payload.memberLabel
            : shortenKey(item.entryId)
        }
      } else if (item.entryId) {
        entryNames[item.entryId] = shortenKey(item.entryId)
      }
    }

    return { entryNameById: entryNames, vaultNameById: vaultNames }
  }, [items, memberVaults])

  const resolveEntryName = useCallback(
    (entryId: string) => entryNameById[entryId] ?? shortenKey(entryId),
    [entryNameById],
  )
  const resolveVaultName = useCallback(
    (vaultId: string) => vaultNameById[vaultId] ?? shortenKey(vaultId),
    [vaultNameById],
  )

  return {
    entryNameById,
    vaultNameById,
    vaultOptions,
    resolveEntryName,
    resolveVaultName,
  }
}
