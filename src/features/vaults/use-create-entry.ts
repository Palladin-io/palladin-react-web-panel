import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import type { AgentFieldAccess, MemberSecretV1 } from '../../shared/crypto/vault-plaintext'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { createEntry, issueEntryCreationChallenge } from './api/vault-api'
import type { AgentField, EntryPlaintext, EntryType } from './types'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from './types'
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
 * Retained error name for callers that distinguish unavailable Vault key
 * material; canonical keys are read only from the in-memory key store.
 */
export class MissingWrappedVaultKeyError extends Error {
  constructor() {
    super('Vault is missing a wrapped VK — cannot derive the encryption key')
    this.name = 'MissingWrappedVaultKeyError'
  }
}

export interface CreateEntryInput {
  vaultId: string
  label: string
  description?: string
  icon?: string
  color?: string
  type: EntryType
  /** Plaintext payload — discriminated on `type`. Encrypted client-side. */
  payload: EntryPlaintext
  /** Domain extracted from a CREDENTIAL's URL (browser extension hint). */
  urlDomain?: string
  /** Plaintext mirror of agent-visible fields (CVT-204) — never a secret. */
  agentFields?: AgentField[]
}

export function useCreateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      const auth = useAuthStore.getState()
      const vaultKey = auth.getVaultKey(input.vaultId)
      const discoveryKey = auth.getVaultDiscoveryKey(input.vaultId)
      if (!vaultKey || !discoveryKey) {
        throw new VaultLockedError()
      }
      try {
        const vault = queryClient.getQueryData<import('./types').Vault>(vaultQueryKey(input.vaultId))
        if (!vault) throw new Error('Vault protocol metadata is not loaded')
        const challenge = await issueEntryCreationChallenge(input.vaultId)
        const entryId = challenge.items[0]?.entryId
        if (!entryId) throw new Error('Entry creation challenge is missing')
        const secret = legacyInputToMemberSecret(input)
        const envelopes = await sealCanonicalEntry({
          organizationId: vault.organizationId, vaultId: vault.id, entryId, revision: '1',
          vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
          vdkVersion: vault.currentKeyEpoch.vdkVersion,
          memberKeyGeneration: vault.memberKeyGeneration,
        }, secret, vaultKey, discoveryKey, 1)
        return createEntry(input.vaultId, { entryId, ...envelopes, grantEnvelopes: [] })
      } finally {
        // Limit the window where raw key copies sit in memory.
        wipe(vaultKey)
        wipe(discoveryKey)
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

export function legacyInputToMemberSecret(input: CreateEntryInput): MemberSecretV1 {
  const entryType = input.type === ENTRY_TYPE_KEY ? 'key' : input.type === ENTRY_TYPE_CREDENTIAL ? 'credential' : 'script'
  const payload = input.payload
  const fields = payload.fields ?? []
  const customFields = fields.map((field) => ({
    id: field.id.startsWith('custom:') ? field.id : `custom:${field.id}`,
    label: field.label.normalize('NFC'), type: field.type, value: field.value,
  }))
  const policy: Record<string, AgentFieldAccess> = {}
  const builtins = entryType === 'key'
    ? ['memberLabel', 'agentLabel', 'description', 'icon', 'color', 'entryType', 'key.value', 'notes']
    : entryType === 'credential'
      ? ['memberLabel', 'agentLabel', 'description', 'icon', 'color', 'entryType', 'credential.username', 'credential.password', 'credential.url', 'credential.urlDomain', 'credential.totp', 'notes']
      : ['memberLabel', 'agentLabel', 'description', 'icon', 'color', 'entryType', 'script.source', 'script.interpreter', 'script.refs', 'notes']
  for (const id of builtins) policy[id] = 'never'
  for (let i = 0; i < customFields.length; i++) policy[customFields[i]!.id] = fields[i]?.agentAccess ?? 'never'
  const discoverable = (input.agentFields?.length ?? 0) > 0
  if (discoverable) { policy.agentLabel = 'discovery'; policy.entryType = 'discovery' }
  const common = {
    schema: 'palladin.member-secret.v1' as const, memberLabel: input.label.normalize('NFC'),
    agentLabel: discoverable ? input.label.normalize('NFC') : null, discoverable,
    description: input.description?.normalize('NFC') ?? null,
    icon: input.icon ? { kind: 'glyph' as const, value: input.icon.normalize('NFC') } : null,
    color: input.color?.toUpperCase() ?? null, agentFieldAccess: policy,
  }
  if (payload.type === ENTRY_TYPE_KEY) return { ...common, entryType: 'key', content: {
    value: payload.value.normalize('NFC'), notes: payload.notes?.normalize('NFC') ?? null, customFields,
  } }
  if (payload.type === ENTRY_TYPE_CREDENTIAL) return { ...common, entryType: 'credential', content: {
    username: payload.username.normalize('NFC'), password: payload.password.normalize('NFC'),
    url: payload.url?.normalize('NFC') ?? null, urlDomain: input.urlDomain?.normalize('NFC') ?? null,
    totp: null, notes: payload.notes?.normalize('NFC') ?? null, customFields,
  } }
  return { ...common, entryType: 'script', content: {
    source: payload.script.normalize('NFC'), interpreter: payload.interpreter,
    refs: (payload.refs ?? []).map((ref) => ({ env: ref.env, vaultId: ref.vaultId ?? input.vaultId, entryId: ref.entryId, fieldId: ref.field })),
    notes: payload.notes?.normalize('NFC') ?? null, customFields,
  } }
}
