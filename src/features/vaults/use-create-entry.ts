import { useMutation, useQueryClient } from '@tanstack/react-query'
import { encryptEntry } from '../../shared/crypto/entry-crypto'
import { wipe } from '../../shared/crypto/sodium'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { useAuthStore } from '../auth'
import { createEntry } from './api/vault-api'
import type { EntryPlaintext, EntryType } from './types'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'

/**
 * Thrown when create is invoked while the vault is still locked. The
 * private key only lives in memory after `unlockVault`, so without it
 * we cannot unseal the VK and cannot encrypt the new entry.
 */
export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked — unlock before creating an entry')
    this.name = 'VaultLockedError'
  }
}

/**
 * Thrown when the vault response does not include `wrappedVK`. The
 * detail endpoint must surface the caller's wrapped VK before any
 * entry can be encrypted; this guards against stale mocks or older
 * backend builds that omit it.
 */
export class MissingWrappedVaultKeyError extends Error {
  constructor() {
    super('Vault is missing a wrapped VK — cannot derive the encryption key')
    this.name = 'MissingWrappedVaultKeyError'
  }
}

export interface CreateEntryInput {
  vaultId: string
  /** Caller's wrapped VK (base64) — fetched from `GET /vaults/{id}`. */
  wrappedVK: string
  label: string
  description?: string
  icon?: string
  color?: string
  type: EntryType
  /** Plaintext payload — discriminated on `type`. Encrypted client-side. */
  payload: EntryPlaintext
  /** Domain extracted from a CREDENTIAL's URL (browser extension hint). */
  urlDomain?: string
}

export function useCreateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) {
        throw new VaultLockedError()
      }
      if (!input.wrappedVK) {
        throw new MissingWrappedVaultKeyError()
      }

      const vaultKey = await unsealVaultKey(input.wrappedVK, privateKey)
      try {
        const content = await encryptEntry(input.payload, vaultKey)
        return createEntry(input.vaultId, {
          label: input.label,
          description: input.description,
          icon: input.icon,
          color: input.color,
          type: input.type,
          content,
          urlDomain: input.urlDomain,
        })
      } finally {
        // VK is rederivable from `wrappedVK + privateKey`; wiping it
        // limits the window where the raw key sits in memory.
        wipe(vaultKey)
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(variables.vaultId) })
      // Entry counts on the vault summary need a refresh too.
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(variables.vaultId) })
      // The vault LIST carries its own `entryCount` per vault (drives the
      // dashboard onboarding "add your first entry" step). It lives under a
      // sibling key, so the entries/detail invalidations above don't reach it.
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      // Cross-vault surfaces that list this entry: the dashboard "Recently
      // added" widget and the global-search autocomplete (recents + hits).
      queryClient.invalidateQueries({ queryKey: ['entries', 'recent'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}
