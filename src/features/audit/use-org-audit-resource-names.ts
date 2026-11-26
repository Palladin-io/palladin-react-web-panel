import { useCallback, useMemo } from 'react'
import { shortenKey } from '../../shared/lib/shorten-key'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import type { AuditLogItem } from './api/audit-api'
import type { AuditFilterOption } from './components/audit-filter-bar'

export interface AuditEntryLogin {
  login: string
  /** The Entry changed after this event, so the login is current, not proven historical. */
  current: boolean
}

export interface OrgAuditResourceNames {
  entryNameById: Record<string, string>
  /** Entries resolved from the unlocked member index; others render as unavailable. */
  availableEntryIds: ReadonlySet<string>
  resolveEntryLogin: (entryId: string, occurredAt: string) => AuditEntryLogin | undefined
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

  const { entryNameById, vaultNameById, entryRecords } = useMemo(() => {
    const entryNames: Record<string, string> = {}
    const vaultNames: Record<string, string> = {}
    const records = new Map<string, { username: string | null; updatedAt: string }>()

    for (const item of items) {
      const vault = item.vaultId ? memberVaults.get(item.vaultId) : undefined
      if (item.vaultId) vaultNames[item.vaultId] = vault?.metadata?.name ?? shortenKey(item.vaultId)
      if (!item.entryId) continue

      // Entry IDs are globally unique; a row without a Vault ID still binds to that exact Entry.
      const record = item.vaultId
        ? vault?.entries.get(item.entryId)
        : [...memberVaults.values()].map((candidate) => candidate.entries.get(item.entryId!)).find(Boolean)
      const readable = record && !record.corrupt && record.payload ? record : null
      entryNames[item.entryId] = readable?.payload?.memberLabel || shortenKey(item.entryId)
      if (readable) records.set(item.entryId, { username: readable.payload?.username ?? null, updatedAt: readable.updatedAt })
    }

    return { entryNameById: entryNames, vaultNameById: vaultNames, entryRecords: records }
  }, [items, memberVaults])

  const availableEntryIds = useMemo(() => new Set(entryRecords.keys()), [entryRecords])
  const resolveEntryLogin = useCallback((entryId: string, occurredAt: string) => {
    const record = entryRecords.get(entryId)
    if (!record?.username) return undefined
    return { login: record.username, current: Date.parse(record.updatedAt) > Date.parse(occurredAt) }
  }, [entryRecords])

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
    availableEntryIds,
    resolveEntryLogin,
    vaultNameById,
    vaultOptions,
    resolveEntryName,
    resolveVaultName,
  }
}
