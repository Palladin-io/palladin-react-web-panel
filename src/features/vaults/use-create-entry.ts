import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createInitialEntryMaterial, type AgentVisibilityPolicy } from '../../shared/crypto/vault-v2-entry'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { openDiscoveryKey } from '../../shared/crypto/vault-v2-rotation'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { collectActiveFullGrants } from '../grants'
import { createEntry, issueEntryCreationChallenge } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'
import type { EntryPlaintext, EntryType } from './types'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked — unlock before creating an entry')
    this.name = 'VaultLockedError'
  }
}

export class MissingWrappedVaultKeyError extends Error {
  constructor() {
    super('Vault is missing a wrapped VK — cannot derive the encryption key')
    this.name = 'MissingWrappedVaultKeyError'
  }
}

export class ActiveFullGrantMaterialRequiredError extends Error {
  constructor() {
    super('Canonical grant material is required for active FULL grants')
    this.name = 'ActiveFullGrantMaterialRequiredError'
  }
}

export interface CreateEntryInput {
  vaultId: string
  label: string
  agentLabel: string
  description?: string
  iconReference?: string
  type: EntryType
  payload: EntryPlaintext
  policy: AgentVisibilityPolicy
}

export function useCreateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()

      const [vault, challenge, fullGrants] = await Promise.all([
        getEncryptedVault(input.vaultId),
        issueEntryCreationChallenge(input.vaultId),
        collectActiveFullGrants(input.vaultId),
      ])
      if (fullGrants.length > 0) throw new ActiveFullGrantMaterialRequiredError()

      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
        organizationId: vault.memberVaultKey.organizationId,
        vaultId: vault.id,
        memberId: vault.memberVaultKey.memberId,
        vkVersion: vault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: vault.memberKeyGeneration,
      }, privateKey)
      let discoveryKey: Uint8Array | undefined
      try {
        discoveryKey = await openDiscoveryKey(vault.discoveryKey, vaultKey)
        const material = await createInitialEntryMaterial({
          memberLabel: input.label,
          agentLabel: input.agentLabel,
          ...(input.description ? { description: input.description } : {}),
          ...(input.iconReference ? { iconReference: input.iconReference } : {}),
          entryType: input.type,
          content: input.payload,
          policy: input.policy,
        }, {
          organizationId: vault.memberVaultKey.organizationId,
          vaultId: vault.id,
          entryId: challenge.entryId,
          vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
          vdkVersion: vault.currentKeyEpoch.vdkVersion,
          memberKeyGeneration: vault.memberKeyGeneration,
        }, vaultKey, discoveryKey)
        return createEntry(input.vaultId, {
          entryId: challenge.entryId,
          ...material,
          grantEnvelopes: [],
        })
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
    },
  })
}
