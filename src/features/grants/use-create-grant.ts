import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth/session/use-authenticated-mutation'
import type { AuthenticatedMutationContext } from '../auth/session/use-authenticated-mutation'
import { authenticatedQueryKey, useAuthStore } from '../auth'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { listGrantableFieldIds } from '../../shared/crypto/vault-plaintext'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { useMemberSyncStore } from '../../shared/stores/member-sync-store'
import {
  GRANT_TYPE_FULL,
  createGrantProactively,
  type CreateGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import {
  grantMethodsFromMask,
  grantMethodsMask,
  serializeGrantMethods,
  type GrantMethod,
} from './grant-methods'
import { MissingGrantMaterialError, VaultLockedError } from './use-approve-grant'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'
import {
  appendFullGrantPreparationEntries,
  cancelFullGrantPreparation,
  commitFullGrantPreparation,
  getFullGrantPreparationMaterial,
  prepareFullGrant,
} from './api/full-grant-preparations-api'

export interface CreateGrantInput {
  vaultId: string
  agentId: string
  agentPublicKey: string | null | undefined
  recipientAgentKeyVersion: number | null | undefined
  type: GrantType
  entryId?: string
  policy: GrantPolicyBody
  methods: GrantMethod[]
}

interface PreparedFullGrantInput {
  vaultId: string
  agentId: string
  grantId: string
  privateKey: Uint8Array
  approvedMethods: number
  policy: GrantPolicyBody
  methods: GrantMethod[]
  context: AuthenticatedMutationContext
}

function assertCurrentUnlockSession(privateKey: Uint8Array): void {
  if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
}

async function createPreparedFullGrant({
  vaultId,
  agentId,
  grantId,
  privateKey,
  approvedMethods,
  policy,
  methods,
  context,
}: PreparedFullGrantInput): Promise<void> {
  let shouldCancel = true
  let vaultKey: Uint8Array | undefined
  try {
    const preparation = await prepareFullGrant(vaultId, {
      grantId,
      agentId,
      methods: serializeGrantMethods(methods),
      ...policy,
    }, context.sessionSnapshot)
    context.assertSessionCurrent()
    assertCurrentUnlockSession(privateKey)

    const vault = await getEncryptedVault(vaultId, undefined, context.sessionSnapshot)
    if (vault.organizationId !== preparation.organizationId
      || vault.memberKeyGeneration !== preparation.memberKeyGeneration) {
      throw new MissingGrantMaterialError()
    }
    vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)

    const seenEntryIds = new Set<string>()
    const seenCursors = new Set<string>()
    let afterEntryId: string | undefined
    while (true) {
      assertCurrentUnlockSession(privateKey)
      context.assertSessionCurrent()
      const page = await getFullGrantPreparationMaterial(vaultId, grantId, {
        organizationId: preparation.organizationId,
        memberKeyGeneration: preparation.memberKeyGeneration,
      }, afterEntryId, context.sessionSnapshot)
      const grantEntries = []
      for (const material of page.items) {
        if (seenEntryIds.has(material.entryId)) throw new MissingGrantMaterialError()
        seenEntryIds.add(material.entryId)
        const memberSecret = await openMemberSecret(
          material.entryKey,
          material.memberSecret,
          vaultKey,
          {
            organizationId: preparation.organizationId,
            vaultId,
            entryId: material.entryId,
            revision: material.entryRevision,
          },
        )
        const approvedFieldIds = listGrantableFieldIds(memberSecret)
        if (approvedFieldIds.length === 0) throw new MissingGrantMaterialError()
        const envelope = await buildCanonicalGrantEnvelope({
          secret: memberSecret,
          agentPublicKey: preparation.agentPublicKey,
          organizationId: preparation.organizationId,
          vaultId,
          grantId,
          agentId,
          entryId: material.entryId,
          entryRevision: material.entryRevision,
          grantEnvelopeRevision: '1',
          grantKeyVersion: 1,
          memberKeyGeneration: preparation.memberKeyGeneration,
          recipientKeyVersion: preparation.recipientAgentKeyVersion,
          approvedMethods,
          approvedFieldIds,
          ...policy,
          ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
        })
        if (envelope.descriptor.binding.recipientKeyFingerprint !== preparation.agentKeyFingerprint) {
          throw new MissingGrantMaterialError()
        }
        grantEntries.push(envelope)
      }
      if (grantEntries.length > 0) {
        assertCurrentUnlockSession(privateKey)
        context.assertSessionCurrent()
        await appendFullGrantPreparationEntries(
          vaultId,
          grantId,
          grantEntries,
          context.sessionSnapshot,
        )
      }

      const nextCursor = page.nextAfterEntryId
      if (nextCursor === null) break
      if (seenCursors.has(nextCursor)) throw new MissingGrantMaterialError()
      seenCursors.add(nextCursor)
      afterEntryId = nextCursor
    }

    assertCurrentUnlockSession(privateKey)
    context.assertSessionCurrent()
    await commitFullGrantPreparation(vaultId, grantId, context.sessionSnapshot)
    shouldCancel = false
  } catch (error) {
    if (shouldCancel) {
      await cancelFullGrantPreparation(
        vaultId,
        grantId,
        context.sessionSnapshot,
      ).catch(() => undefined)
    }
    throw error
  } finally {
    if (vaultKey) wipe(vaultKey)
  }
}

export function useCreateGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      vaultId,
      agentId,
      agentPublicKey,
      recipientAgentKeyVersion,
      type,
      entryId,
      policy,
      methods,
    }: CreateGrantInput, context) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      const requestedMethods = grantMethodsMask(methods)
      if (requestedMethods === 0) throw new MissingGrantMaterialError()
      const grantId = crypto.randomUUID()

      if (type === GRANT_TYPE_FULL) {
        await createPreparedFullGrant({
          vaultId, agentId, grantId, privateKey, approvedMethods: requestedMethods,
          policy, methods, context,
        })
        return
      }

      if (!agentPublicKey || !recipientAgentKeyVersion || !entryId) {
        throw new MissingGrantMaterialError()
      }

      const syncedVault = useMemberSyncStore.getState().vaults.get(vaultId)
      if (!syncedVault || syncedVault.status !== 'ready') throw new MissingGrantMaterialError()

      const vault = await getEncryptedVault(vaultId, undefined, context.sessionSnapshot)
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      try {
        const detail = await getCanonicalEntry(
          vaultId,
          entryId,
          undefined,
          context.sessionSnapshot,
        )
        const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId,
          revision: detail.currentRevision,
        })
        const approvedMethods = requestedMethods
        const approvedFieldIds = listGrantableFieldIds(memberSecret)
        if (approvedMethods === 0 || approvedFieldIds.length === 0) {
          throw new MissingGrantMaterialError()
        }
        const envelope = await buildCanonicalGrantEnvelope({
          secret: memberSecret,
          agentPublicKey,
          organizationId: detail.organizationId, vaultId, grantId, agentId, entryId,
          entryRevision: detail.currentRevision, grantEnvelopeRevision: '1', grantKeyVersion: 1,
          memberKeyGeneration: vault.memberKeyGeneration, recipientKeyVersion: recipientAgentKeyVersion,
          approvedMethods, approvedFieldIds,
          ...policy, ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
        })

        const body: CreateGrantBody = {
          grantId,
          agentId,
          type,
          entryId,
          grantEntries: [envelope],
          ...policy,
          methods: serializeGrantMethods(grantMethodsFromMask(approvedMethods)),
        }
        context.assertSessionCurrent()
        await createGrantProactively(vaultId, body, context.sessionSnapshot)
      } finally {
        wipe(vaultKey)
      }
    },
    onSuccess: () => {
      for (const queryKey of GRANT_MUTATION_INVALIDATION_KEYS) {
        queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(queryKey) })
      }
    },
  })
}
