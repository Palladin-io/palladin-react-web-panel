import { create } from 'zustand'
import type { DecryptedMemberIndex, MemberVaultMetadata } from '../../../shared/crypto/vault-v2-member-sync'
import type { EncryptedVaultSummary } from './member-sync-api'

export type MemberEntryState = 'active' | 'archived' | 'deleted'
export type MemberSyncStatus = 'idle' | 'syncing' | 'resetting' | 'ready' | 'error'
export type MemberVaultFailureKind = 'metadata' | 'sync'

export interface MemberVaultStructure {
  isDefault: boolean
  createdAt: string
  updatedAt: string
  memberCount: number
  entryCount: number
  activeGrantCount: number
}

export interface MemberIndexRecord {
  entryId: string
  state: MemberEntryState
  currentRevision: string
  memberIndexRevision: string
  currentKeyVersion: number
  payload: DecryptedMemberIndex | null
  corrupt: boolean
}

export interface DecryptedMemberVault {
  vaultId: string
  metadata: MemberVaultMetadata | null
  structure: MemberVaultStructure
  entries: ReadonlyMap<string, MemberIndexRecord>
  appliedThroughSequence: string
  status: Exclude<MemberSyncStatus, 'idle'>
  failureKind: MemberVaultFailureKind | null
}

interface MemberSyncState {
  status: MemberSyncStatus
  vaults: ReadonlyMap<string, DecryptedMemberVault>
  error: string | null
  begin: () => void
  publishVault: (vault: DecryptedMemberVault) => void
  retainVaults: (vaultIds: ReadonlySet<string>) => void
  reconcileEntry: (vaultId: string, entry: MemberIndexRecord | { entryId: string; tombstone: true }) => void
  resetVault: (vaultId: string) => void
  failVault: (
    vault: EncryptedVaultSummary,
    failureKind: MemberVaultFailureKind,
    metadata?: MemberVaultMetadata,
  ) => void
  retryGeneration: number
  retry: () => void
  complete: () => void
  fail: () => void
  clear: () => void
}

const initialState = {
  status: 'idle' as const,
  vaults: new Map<string, DecryptedMemberVault>(),
  error: null,
  retryGeneration: 0,
}

export function memberVaultStructure(vault: EncryptedVaultSummary): MemberVaultStructure {
  return {
    isDefault: vault.isDefault,
    createdAt: vault.createdAt,
    updatedAt: vault.updatedAt,
    memberCount: vault.memberCount,
    entryCount: vault.entryCount,
    activeGrantCount: vault.activeGrantCount,
  }
}

export const useMemberSyncStore = create<MemberSyncState>((set) => ({
  ...initialState,
  begin: () => set({ status: 'syncing', error: null }),
  publishVault: (vault) => set((state) => {
    const vaults = new Map(state.vaults)
    vaults.set(vault.vaultId, vault)
    return { vaults }
  }),
  retainVaults: (vaultIds) => set((state) => ({
    vaults: new Map(Array.from(state.vaults).filter(([vaultId]) => vaultIds.has(vaultId))),
  })),
  reconcileEntry: (vaultId, entry) => set((state) => {
    const vault = state.vaults.get(vaultId)
    if (!vault) return state
    const entries = new Map(vault.entries)
    if ('tombstone' in entry) entries.delete(entry.entryId)
    else {
      const current = entries.get(entry.entryId)
      if (!current || BigInt(current.memberIndexRevision) <= BigInt(entry.memberIndexRevision)) entries.set(entry.entryId, entry)
    }
    const vaults = new Map(state.vaults)
    vaults.set(vaultId, { ...vault, entries })
    return { vaults }
  }),
  resetVault: (vaultId) => set((state) => {
    const current = state.vaults.get(vaultId)
    if (!current) return state
    const vaults = new Map(state.vaults)
    vaults.set(vaultId, { ...current, status: 'resetting' })
    return { vaults }
  }),
  failVault: (vault, failureKind, metadata) => set((state) => {
    const current = state.vaults.get(vault.id)
    const vaults = new Map(state.vaults)
    vaults.set(vault.id, current && failureKind === 'sync'
      ? {
          ...current,
          metadata: metadata ?? current.metadata,
          structure: memberVaultStructure(vault),
          status: 'error',
          failureKind,
        }
      : {
          vaultId: vault.id,
          metadata: failureKind === 'sync' ? metadata ?? null : null,
          structure: memberVaultStructure(vault),
          entries: new Map(),
          appliedThroughSequence: vault.memberSequence,
          status: 'error',
          failureKind,
        })
    return { vaults }
  }),
  retry: () => set((state) => ({ retryGeneration: state.retryGeneration + 1 })),
  complete: () => set({ status: 'ready', error: null }),
  fail: () => set({ status: 'error', error: 'member-sync-failed' }),
  clear: () => set(initialState),
}))

export function searchMemberIndex(query: string, states?: ReadonlySet<MemberEntryState>): MemberIndexRecord[] {
  const normalized = query.normalize('NFC').trim().toLocaleLowerCase()
  if (!normalized) return []
  const matches: MemberIndexRecord[] = []
  for (const vault of useMemberSyncStore.getState().vaults.values()) {
    for (const entry of vault.entries.values()) {
      if (entry.corrupt || !entry.payload || (states && !states.has(entry.state))) continue
      const fields = [entry.payload.memberLabel, ...entry.payload.searchFields]
      if (fields.some((field) => field.toLocaleLowerCase().includes(normalized))) matches.push(entry)
    }
  }
  return matches
}
