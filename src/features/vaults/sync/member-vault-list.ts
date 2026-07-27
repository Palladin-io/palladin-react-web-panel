import { useDeferredValue, useMemo } from 'react'
import { useMemberSyncStore, type DecryptedMemberVault, type MemberSyncStatus } from './member-sync-store'
import { presentationIconReference } from '../../../shared/crypto/vault-plaintext'

export interface MemberVaultListItem {
  id: string
  name: string | null
  description: string | null
  icon: string | null
  color: string | null
  createdAt: string
  updatedAt: string
  entryCount: number
  activeGrantCount: number
  memberCount: number
  syncStatus: DecryptedMemberVault['status']
  failureKind: DecryptedMemberVault['failureKind']
}

function materialIconReference(reference: string | undefined): string | null {
  if (!reference) return null
  if (reference.startsWith('builtin:')) return reference.slice('builtin:'.length) || null
  return reference.includes(':') ? null : reference
}

function safeVaultColor(color: string | null | undefined): string | null {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null
}

export function buildMemberVaultList(vaults: ReadonlyMap<string, DecryptedMemberVault>): MemberVaultListItem[] {
  return Array.from(vaults.values(), (vault) => ({
    id: vault.vaultId,
    name: vault.metadata?.name ?? null,
    description: vault.metadata?.description ?? null,
    icon: materialIconReference(presentationIconReference(vault.metadata?.icon ?? null)),
    color: safeVaultColor(vault.metadata?.color),
    createdAt: vault.structure.createdAt,
    updatedAt: vault.structure.updatedAt,
    entryCount: vault.structure.entryCount,
    activeGrantCount: vault.structure.activeGrantCount,
    memberCount: vault.structure.memberCount,
    syncStatus: vault.status,
    failureKind: vault.failureKind,
  }))
}

export function filterMemberVaults(items: MemberVaultListItem[], query: string): MemberVaultListItem[] {
  const normalized = query.normalize('NFC').trim().toLocaleLowerCase()
  if (!normalized) return items
  return items.filter((vault) => {
    if (vault.name === null) return true
    return `${vault.name} ${vault.description ?? ''}`.normalize('NFC').toLocaleLowerCase().includes(normalized)
  })
}

export function useMemberVaultList(query: string): {
  status: MemberSyncStatus
  items: MemberVaultListItem[]
  allItems: MemberVaultListItem[]
  retry: () => void
} {
  const status = useMemberSyncStore((state) => state.status)
  const vaults = useMemberSyncStore((state) => state.vaults)
  const retry = useMemberSyncStore((state) => state.retry)
  const deferredQuery = useDeferredValue(query)
  const allItems = useMemo(() => buildMemberVaultList(vaults), [vaults])
  const items = useMemo(() => filterMemberVaults(allItems, deferredQuery), [allItems, deferredQuery])
  return { status, items, allItems, retry }
}
