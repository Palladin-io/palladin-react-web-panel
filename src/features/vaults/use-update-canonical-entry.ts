import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import { toMemberSecret, type EntryDraft, type MemberSecretView } from '../../shared/crypto/entry-draft'
import { buildCanonicalGrantEnvelope, listGrantableFields } from '../../shared/crypto/grant-protocol'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { projectAgentDiscovery } from '../../shared/crypto/vault-plaintext'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import {
  GRANT_STATUS_ACTIVE,
  GRANT_TYPE_FULL,
  getOrgGrants,
  type OrgGrant,
} from '../grants'
import { grantMethodsMask, parseGrantMethods } from '../grants/grant-methods'
import { updateCanonicalEntry, type CanonicalEntryDetail } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'
import { entriesQueryKey, entryDetailQueryKey, entryHistoryQueryKey } from './use-entries'

export class ActiveGrantRefreshRequiredError extends Error {
  constructor() {
    super('Active grant envelope context is incomplete or no longer permits a payload')
    this.name = 'ActiveGrantRefreshRequiredError'
  }
}

export interface UpdateCanonicalEntryInput {
  detail: CanonicalEntryDetail
  previous: MemberSecretView
  draft: EntryDraft
}

async function activeCoveringGrants(vaultId: string, entryId: string): Promise<OrgGrant[]> {
  const result: OrgGrant[] = []
  let cursor: string | undefined
  do {
    const page = await getOrgGrants({ vaultId, status: GRANT_STATUS_ACTIVE, cursor, pageSize: 100 })
    result.push(...page.items.filter((grant) => grant.type === GRANT_TYPE_FULL || grant.entryId === entryId))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return result
}

export function useUpdateCanonicalEntry(vaultId: string, entryId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ detail, previous, draft }: UpdateCanonicalEntryInput) => {
      const [grants, vault] = await Promise.all([
        activeCoveringGrants(vaultId, entryId),
        getEncryptedVault(vaultId),
      ])
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new Error('Vault is locked')
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      let discoveryKey: Uint8Array | undefined
      try {
        discoveryKey = await openVaultDerivedEnvelope(vault.discoveryKey, vaultKey)
        const nextSecret = toMemberSecret({
          label: draft.memberLabel, agentLabel: draft.agentLabel,
          ...(draft.description ? { description: draft.description } : {}),
          ...(draft.iconReference ? { iconReference: draft.iconReference } : {}),
          type: draft.entryType, payload: draft.content, policy: draft.policy, vaultId,
        })
        const previousSecret = toMemberSecret({
          label: previous.memberLabel, agentLabel: previous.agentLabel,
          ...(previous.description ? { description: previous.description } : {}),
          ...(previous.iconReference ? { iconReference: previous.iconReference } : {}),
          type: previous.entryType, payload: previous.content,
          policy: previous.agentVisibilityPolicy, vaultId,
        })
        const nextRevision = (BigInt(detail.currentRevision) + 1n).toString()
        const nextDiscovery = projectAgentDiscovery(nextSecret)
        const previousDiscovery = projectAgentDiscovery(previousSecret)
        const agentDiscoveryChanged = JSON.stringify(nextDiscovery) !== JSON.stringify(previousDiscovery)
        const envelopes = await sealCanonicalEntry({
          organizationId: detail.organizationId, vaultId, entryId,
          revision: nextRevision,
          entryKeyRevision: (BigInt(detail.entryKey.descriptor.resourceRevision) + 1n).toString(),
          entryKeyVersion: detail.currentKeyVersion + 1,
          memberIndexRevision: (BigInt(detail.memberIndexRevision) + 1n).toString(),
          agentDiscoveryRevision: (BigInt(detail.agentDiscoveryRevisionHighWatermark) + 1n).toString(),
          vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
          vdkVersion: vault.currentKeyEpoch.vdkVersion,
          memberKeyGeneration: vault.memberKeyGeneration,
        }, nextSecret, vaultKey, discoveryKey, 2)
        const material = {
          baseRevision: detail.currentRevision,
          newEntryKey: envelopes.entryKey,
          memberSecret: envelopes.memberSecret,
          memberIndex: envelopes.memberIndex,
          agentDiscoveryChanged,
          ...(agentDiscoveryChanged && envelopes.agentDiscovery ? { agentDiscovery: envelopes.agentDiscovery } : {}),
          grantEnvelopes: [] as Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>[],
        }
        if (grants.length > 0) {
          const grantEnvelopes = []
          const grantable = new Set(listGrantableFields(nextSecret).map((field) => field.id))
          for (const grant of grants) {
            const scope = grant.entryScopes.find((candidate) => candidate.entryId === entryId)
            const methods = parseGrantMethods(grant.methods)
            if (!scope?.grantEnvelopeRevision || !scope.grantKeyVersion || !scope.fieldIds.length
              || !grant.agentId || !grant.agentPublicKey || !grant.recipientAgentKeyVersion
              || methods.length === 0) throw new ActiveGrantRefreshRequiredError()
            try {
              const approvedFieldIds = scope.fieldIds.filter((fieldId) => grantable.has(fieldId))
              if (approvedFieldIds.length === 0) throw new ActiveGrantRefreshRequiredError()
              grantEnvelopes.push(await buildCanonicalGrantEnvelope({
                secret: nextSecret,
                agentPublicKey: grant.agentPublicKey,
                approvedFieldIds,
                organizationId: detail.organizationId, vaultId, grantId: grant.id,
                agentId: grant.agentId, entryId, entryRevision: nextRevision,
                grantEnvelopeRevision: (BigInt(scope.grantEnvelopeRevision) + 1n).toString(),
                grantKeyVersion: scope.grantKeyVersion + 1,
                memberKeyGeneration: vault.memberKeyGeneration,
                recipientKeyVersion: grant.recipientAgentKeyVersion,
                approvedMethods: grantMethodsMask(methods),
                ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
                ...(grant.queryLimit !== null && grant.queryLimit !== undefined
                  ? { remainingUses: grant.queryLimit - (grant.queryCount ?? 0) }
                  : {}),
              }))
            } catch {
              throw new ActiveGrantRefreshRequiredError()
            }
          }
          material.grantEnvelopes = grantEnvelopes
        }
        // Ciphertext prepared by an invalidated unlock session must never be
        // submitted, even when the user has already unlocked again.
        if (useAuthStore.getState().privateKey !== privateKey) {
          throw new Error('Vault lock session changed')
        }
        return updateCanonicalEntry(vaultId, entryId, material)
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryDetailQueryKey(vaultId, entryId) })
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(vaultId) })
      queryClient.invalidateQueries({ queryKey: entryHistoryQueryKey(vaultId, entryId) })
    },
  })
}
