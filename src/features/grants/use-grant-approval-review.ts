import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listGrantableFields } from '../../shared/crypto/grant-protocol'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { openEncryptedReason } from '../../shared/crypto/reason-protocol'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { ENVELOPE_PURPOSE } from '../../shared/crypto/envelope'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import type { PendingGrant } from './api/pending-grants-api'
import { normalizeEntryType } from '../../shared/types/entry-type'

export type GrantReviewStage =
  | 'fetch'
  | 'preflight'
  | 'vaultKey'
  | 'entrySecret'
  | 'encryptedReason'
  | 'sessionChanged'

export class GrantReviewUnavailableError extends Error {
  readonly stage: GrantReviewStage

  constructor(stage: GrantReviewStage, options?: ErrorOptions) {
    super(`Grant review unavailable at ${stage}`, options)
    this.name = 'GrantReviewUnavailableError'
    this.stage = stage
  }
}

export function useGrantApprovalReview(grant: PendingGrant | null) {
  const sessionKey = useAuthStore((state) => state.privateKey)
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['grants', 'approval-review', grant?.id] as const, [grant?.id])
  const query = useQuery({
    queryKey,
    enabled: Boolean(grant && sessionKey),
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      if (!grant || !sessionKey || !grant.entryId || !grant.agentId) throw new GrantReviewUnavailableError('preflight')
      let vault: Awaited<ReturnType<typeof getEncryptedVault>>
      let detail: Awaited<ReturnType<typeof getCanonicalEntry>>
      try {
        ;[vault, detail] = await Promise.all([
          getEncryptedVault(grant.vaultId),
          getCanonicalEntry(grant.vaultId, grant.entryId),
        ])
      } catch (error) {
        throw new GrantReviewUnavailableError('fetch', { cause: error })
      }
      if (useAuthStore.getState().privateKey !== sessionKey) throw new GrantReviewUnavailableError('sessionChanged')
      if (detail.state !== 'active' && detail.state !== 1) throw new GrantReviewUnavailableError('preflight')
      const reason = grant.encryptedReason
      const reasonScope = reason.descriptor.scope
      if (reasonScope.organizationId !== detail.organizationId || reasonScope.vaultId !== grant.vaultId
        || reasonScope.entryId !== grant.entryId || reasonScope.agentId !== grant.agentId
        || reasonScope.grantOrRequestId !== grant.id
        || reason.descriptor.binding.recipientKeyVersion !== vault.currentKeyEpoch.agentMessageKeyVersion
        || !grant.agentSigningPublicKey || !grant.agentSigningKeyVersion || !grant.agentSigningKeyFingerprint) {
        throw new GrantReviewUnavailableError('preflight')
      }
      let vaultKey: Uint8Array
      try {
        vaultKey = await openMemberVaultKey(vault.memberVaultKey, sessionKey)
      } catch (error) {
        throw new GrantReviewUnavailableError('vaultKey', { cause: error })
      }
      try {
        const envelope = vault.vaultPrivateKeys.find((item) =>
          item.descriptor.purpose === ENVELOPE_PURPOSE.agentMessagePrivateByVk
          && item.descriptor.keyVersion === reason.descriptor.binding.recipientKeyVersion)
        if (!envelope) {
          throw new GrantReviewUnavailableError('preflight')
        }
        const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
            organizationId: detail.organizationId, vaultId: grant.vaultId,
            entryId: grant.entryId, revision: detail.currentRevision,
          }).catch((error: unknown) => {
            throw new GrantReviewUnavailableError('entrySecret', { cause: error })
          })
        const decryptedReason = await openEncryptedReason(reason, vault.vaultPrivateKeys, vaultKey, {
            publicKey: grant.agentSigningPublicKey,
            keyVersion: grant.agentSigningKeyVersion,
            keyFingerprint: grant.agentSigningKeyFingerprint,
          }, {
            organizationId: detail.organizationId, vaultId: grant.vaultId,
            entryId: grant.entryId, grantId: grant.id, agentId: grant.agentId,
          }).catch((error: unknown) => {
            throw new GrantReviewUnavailableError('encryptedReason', { cause: error })
          })
        if (useAuthStore.getState().privateKey !== sessionKey) throw new GrantReviewUnavailableError('sessionChanged')
        return {
          entryLabel: memberSecret.memberLabel,
          reason: decryptedReason,
          entryRevision: detail.currentRevision,
          entryType: normalizeEntryType(memberSecret.entryType),
          fields: listGrantableFields(memberSecret),
        }
      } finally {
        wipe(vaultKey)
      }
    },
  })
  useEffect(() => {
    if (!sessionKey) queryClient.removeQueries({ queryKey, exact: true })
  }, [queryClient, queryKey, sessionKey])
  // Disabled queries retain their last result while observed. Never expose
  // decrypted review data after the in-memory session key has been wiped.
  return { ...query, data: sessionKey ? query.data : undefined }
}
