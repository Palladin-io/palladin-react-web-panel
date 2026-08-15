import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { openEncryptedReason, type EncryptedReasonContract } from '../../shared/crypto/reason-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { useAuthStore } from '../auth'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { GRANT_REASONS_QUERY_KEY } from './query-keys'

export interface GrantReasonSource {
  id: string
  vaultId: string
  entryId?: string | null
  agentId?: string | null
  encryptedReason?: EncryptedReasonContract | null
  agentSigningPublicKey?: string | null
  agentSigningKeyVersion?: number | null
  agentSigningKeyFingerprint?: string | null
}

const EMPTY_REASONS: ReadonlyMap<string, string> = new Map()

/**
 * Opens access reasons for grant cards without ever sending plaintext to the
 * server. Results live only in TanStack Query's in-memory cache for the current
 * unlocked session and are removed as soon as the private key disappears.
 */
export function useGrantReasons(grants: readonly GrantReasonSource[]) {
  const sessionKey = useAuthStore((state) => state.privateKey)
  const queryClient = useQueryClient()
  const eligible = useMemo(() => grants.filter(hasReasonMaterial), [grants])
  const reasonCoordinates = useMemo(
    () => eligible.map((grant) => [
      grant.id,
      grant.encryptedReason!.descriptor.resourceRevision,
      grant.agentSigningKeyFingerprint,
    ] as const),
    [eligible],
  )

  const query = useQuery({
    queryKey: [...GRANT_REASONS_QUERY_KEY, reasonCoordinates] as const,
    enabled: Boolean(sessionKey && eligible.length > 0),
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      if (!sessionKey) return new Map<string, string>()
      const byVault = new Map<string, typeof eligible>()
      for (const grant of eligible) {
        const group = byVault.get(grant.vaultId)
        if (group) group.push(grant)
        else byVault.set(grant.vaultId, [grant])
      }
      const resolved = new Map<string, string>()

      await Promise.all([...byVault].map(async ([vaultId, vaultGrants]) => {
        let vaultKey: Uint8Array | undefined
        try {
          const vault = await getEncryptedVault(vaultId)
          if (useAuthStore.getState().privateKey !== sessionKey) return
          vaultKey = await openMemberVaultKey(vault.memberVaultKey, sessionKey)
          for (const grant of vaultGrants) {
            try {
              const reason = await openEncryptedReason(
                grant.encryptedReason!,
                vault.vaultPrivateKeys,
                vaultKey,
                {
                  publicKey: grant.agentSigningPublicKey!,
                  keyVersion: grant.agentSigningKeyVersion!,
                  keyFingerprint: grant.agentSigningKeyFingerprint!,
                },
                {
                  organizationId: vault.organizationId,
                  vaultId,
                  entryId: grant.entryId ?? undefined,
                  grantId: grant.id,
                  agentId: grant.agentId!,
                },
              )
              if (useAuthStore.getState().privateKey !== sessionKey) return
              resolved.set(grant.id, reason)
            } catch {
              // Fail closed per grant. Never log the envelope, coordinates, or
              // crypto error because they can contain attacker-controlled data.
            }
          }
        } catch {
          // A locked/stale Vault leaves its reasons unavailable without
          // suppressing the structural grants list.
        } finally {
          if (vaultKey) wipe(vaultKey)
        }
      }))

      return resolved
    },
  })

  useEffect(() => {
    if (!sessionKey) queryClient.removeQueries({ queryKey: GRANT_REASONS_QUERY_KEY })
  }, [queryClient, sessionKey])

  return sessionKey ? query.data ?? EMPTY_REASONS : EMPTY_REASONS
}

function hasReasonMaterial(grant: GrantReasonSource): grant is GrantReasonSource & {
  entryId?: string
  agentId: string
  encryptedReason: EncryptedReasonContract
  agentSigningPublicKey: string
  agentSigningKeyVersion: number
  agentSigningKeyFingerprint: string
} {
  return Boolean(
    grant.agentId
    && grant.encryptedReason
    && grant.agentSigningPublicKey
    && grant.agentSigningKeyVersion
    && grant.agentSigningKeyFingerprint,
  )
}
