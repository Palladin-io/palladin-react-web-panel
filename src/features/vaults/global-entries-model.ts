import { create } from 'zustand'
import { useAuthStore } from '../auth'
import { shortenKey } from '../../shared/lib/shorten-key'
import { presentationIconReference } from '../../shared/crypto/vault-plaintext'
import type { DecryptedMemberVault } from './sync/member-sync-store'
import { buildMemberEntryList, type MemberEntryListItem } from './sync/member-entry-list'

export interface GlobalEntryItem extends MemberEntryListItem {
  vaultId: string
  vaultName: string
}

export function globalEntries(vaults: ReadonlyMap<string, DecryptedMemberVault>, query: string): GlobalEntryItem[] {
  const needle = query.normalize('NFC').trim().toLocaleLowerCase()
  return [...vaults.values()].flatMap((vault) => {
    if (vault.status === 'resetting') return []
    return buildMemberEntryList(vault).map((entry) => ({ ...entry,
      icon: entry.corrupt ? null : presentationIconReference(vault.entries.get(entry.id)?.payload?.icon ?? null) ?? null,
      vaultId: vault.vaultId, vaultName: vault.metadata?.name ?? shortenKey(vault.vaultId) }))
  }).filter((entry) => entry.state === 'active'
    && (!needle || [entry.label, ...entry.searchFields].some((value) => value.normalize('NFC').toLocaleLowerCase().includes(needle))))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      || a.vaultId.localeCompare(b.vaultId) || a.id.localeCompare(b.id))
}

const initial = { query: '', scrollTop: 0, renderLimit: 100 }
export const useGlobalEntriesUi = create<typeof initial>(() => initial)
useAuthStore.subscribe((state, previous) => {
  if (state.cryptoSessionGeneration !== previous.cryptoSessionGeneration || state.userId !== previous.userId || state.isVaultLocked) useGlobalEntriesUi.setState(initial)
})
