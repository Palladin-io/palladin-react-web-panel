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

export class GrantReviewUnavailableError extends Error {}

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
      if (!grant || !sessionKey || !grant.entryId || !grant.agentId) throw new GrantReviewUnavailableError()
      const [vault, detail] = await Promise.all([
        getEncryptedVault(grant.vaultId),
        getCanonicalEntry(grant.vaultId, grant.entryId),
      ])
      if (useAuthStore.getState().privateKey !== sessionKey) throw new GrantReviewUnavailableError()
      if (detail.state !== 'active' && detail.state !== 1) throw new GrantReviewUnavailableError()
      const reason = grant.encryptedReason
      const reasonScope = reason.descriptor.scope
      if (reasonScope.organizationId !== detail.organizationId || reasonScope.vaultId !== grant.vaultId
        || reasonScope.entryId !== grant.entryId || reasonScope.agentId !== grant.agentId
        || reasonScope.grantOrRequestId !== grant.id
        || reason.descriptor.binding.recipientKeyVersion !== vault.currentKeyEpoch.agentMessageKeyVersion
        || !grant.agentSigningPublicKey || !grant.agentSigningKeyVersion || !grant.agentSigningKeyFingerprint) {
        throw new GrantReviewUnavailableError()
      }
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, sessionKey)
      try {
        const envelope = vault.vaultPrivateKeys.find((item) =>
          item.descriptor.purpose === ENVELOPE_PURPOSE.agentMessagePrivateByVk
          && item.descriptor.keyVersion === reason.descriptor.binding.recipientKeyVersion)
        if (!envelope) {
          throw new GrantReviewUnavailableError()
        }
        const [memberSecret, decryptedReason] = await Promise.all([
          openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
            organizationId: detail.organizationId, vaultId: grant.vaultId,
            entryId: grant.entryId, revision: detail.currentRevision,
          }),
          openEncryptedReason(reason, vault.vaultPrivateKeys, vaultKey, {
            publicKey: grant.agentSigningPublicKey,
            keyVersion: grant.agentSigningKeyVersion,
            keyFingerprint: grant.agentSigningKeyFingerprint,
          }, {
            organizationId: detail.organizationId, vaultId: grant.vaultId,
            entryId: grant.entryId, grantId: grant.id, agentId: grant.agentId,
          }),
        ])
        if (useAuthStore.getState().privateKey !== sessionKey) throw new GrantReviewUnavailableError()
        return {
          entryLabel: memberSecret.memberLabel,
          reason: decryptedReason,
          entryRevision: detail.currentRevision,
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
