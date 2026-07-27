import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { decryptEncryptedReason } from '../../shared/crypto/encrypted-reason'
import { listGrantableFields } from '../../shared/crypto/grant-envelope'
import { decryptMemberSecret } from '../../shared/crypto/vault-v2-entry'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { openVaultPrivateKey, type RotationPrivateKeyEnvelope } from '../../shared/crypto/vault-v2-rotation'
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
      if (reason.organizationId !== detail.organizationId || reason.vaultId !== grant.vaultId
        || reason.entryId !== grant.entryId || reason.agentId !== grant.agentId
        || reason.grantRequestId !== grant.id
        || reason.agentMessageKeyVersion !== vault.currentKeyEpoch.agentMessageKeyVersion) {
        throw new GrantReviewUnavailableError()
      }
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
        organizationId: detail.organizationId,
        vaultId: grant.vaultId,
        memberId: vault.memberVaultKey.memberId,
        vkVersion: vault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: vault.memberKeyGeneration,
      }, sessionKey)
      let agentMessagePrivateKey: Uint8Array | undefined
      try {
        const envelope = vault.vaultPrivateKeys.find((item) => item.privateKeyKind === 1)
        if (!envelope || envelope.privateKeyVersion !== reason.agentMessageKeyVersion) {
          throw new GrantReviewUnavailableError()
        }
        agentMessagePrivateKey = await openVaultPrivateKey(envelope as RotationPrivateKeyEnvelope, vaultKey)
        const [memberSecret, decryptedReason] = await Promise.all([
          decryptMemberSecret(detail, vaultKey),
          decryptEncryptedReason(reason, agentMessagePrivateKey),
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
        if (agentMessagePrivateKey) wipe(agentMessagePrivateKey)
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
