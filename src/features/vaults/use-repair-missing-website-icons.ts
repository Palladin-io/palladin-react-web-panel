import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ensureWebsiteIconsWithin,
  normalizePublicHostname,
} from '../../shared/api/public-assets-api'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { fromMemberSecret, type MemberSecretView } from '../../shared/crypto/entry-draft'
import { wipe } from '../../shared/crypto/sodium'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { publicAssetIconReference } from '../../shared/crypto/vault-plaintext'
import { useAuthStore } from '../auth'
import { getCanonicalEntry } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'
import { useMemberSyncStore, type DecryptedMemberVault } from './sync/member-sync-store'
import { ENTRY_TYPE_CREDENTIAL } from './types'
import {
  invalidateCanonicalEntryQueries,
  updateCanonicalEntryNow,
} from './use-update-canonical-entry'

const MISSING_ICON_REPAIR_WAIT_MS = 15_000

interface MissingWebsiteIconCandidate {
  entryId: string
  hostname: string
}

export interface MissingWebsiteIconRepairProgress {
  phase: 'prepare' | 'repair'
  done: number
  total: number
}

export interface RepairMissingWebsiteIconsInput {
  onProgress?: (progress: MissingWebsiteIconRepairProgress) => void
}

export interface RepairMissingWebsiteIconsResult {
  candidates: number
  repaired: number
  skipped: number
  failed: number
}

function missingWebsiteIconCandidates(
  vault: DecryptedMemberVault | undefined,
): MissingWebsiteIconCandidate[] {
  if (!vault || vault.status !== 'ready') return []
  return [...vault.entries.values()].flatMap((entry) => {
    const payload = entry.payload
    if (entry.state !== 'active' || entry.corrupt || !payload
      || payload.entryType !== 'credential' || payload.icon !== null || !payload.urlDomain) return []
    const hostname = normalizePublicHostname(payload.urlDomain)
    return hostname ? [{ entryId: entry.entryId, hostname }] : []
  })
}

function assertUnlockSession(privateKey: Uint8Array, cryptoSessionGeneration: number): void {
  const session = useAuthStore.getState()
  if (session.privateKey !== privateKey
    || session.cryptoSessionGeneration !== cryptoSessionGeneration) {
    throw new DOMException('Vault lock session changed', 'AbortError')
  }
}

/**
 * Explicitly repairs canonical public-asset references omitted by a bounded
 * import. Catalog work completes before any Vault key is opened. Each eligible
 * Entry is then decrypted and updated independently through the normal
 * canonical revision/grant-refresh mutation; one bad Entry cannot expose or
 * block the rest of the batch.
 */
export function useRepairMissingWebsiteIcons(vaultId: string) {
  const queryClient = useQueryClient()
  const vault = useMemberSyncStore((state) => state.vaults.get(vaultId))
  const candidates = useMemo(() => missingWebsiteIconCandidates(vault), [vault])
  const mutation = useMutation({
    mutationFn: async (
      input: RepairMissingWebsiteIconsInput,
    ): Promise<RepairMissingWebsiteIconsResult> => {
      const snapshot = missingWebsiteIconCandidates(
        useMemberSyncStore.getState().vaults.get(vaultId),
      )
      if (snapshot.length === 0) {
        return { candidates: 0, repaired: 0, skipped: 0, failed: 0 }
      }

      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new DOMException('Vault is locked', 'AbortError')
      const cryptoSessionGeneration = useAuthStore.getState().cryptoSessionGeneration
      const hostnames = [...new Set(snapshot.map((candidate) => candidate.hostname))]
      const assets = await ensureWebsiteIconsWithin(
        hostnames,
        MISSING_ICON_REPAIR_WAIT_MS,
        (done, total) => input.onProgress?.({ phase: 'prepare', done, total }),
      )
      assertUnlockSession(privateKey, cryptoSessionGeneration)

      const ready = snapshot.filter((candidate) => assets.has(candidate.hostname))
      let repaired = 0
      let skipped = snapshot.length - ready.length
      let failed = 0
      input.onProgress?.({ phase: 'repair', done: 0, total: ready.length })
      if (ready.length === 0) {
        return { candidates: snapshot.length, repaired, skipped, failed }
      }

      // Fetch the authenticated Vault envelope only after public catalog work.
      // The key itself is opened for one Entry at a time and wiped before the
      // canonical update path opens its own short-lived mutation key.
      const encryptedVault = await getEncryptedVault(vaultId)
      for (const candidate of ready) {
        assertUnlockSession(privateKey, cryptoSessionGeneration)
        try {
          const detail = await getCanonicalEntry(vaultId, candidate.entryId)
          assertUnlockSession(privateKey, cryptoSessionGeneration)
          const vaultKey = await openMemberVaultKey(encryptedVault.memberVaultKey, privateKey)
          let previous: MemberSecretView
          try {
            previous = fromMemberSecret(await openMemberSecret(
              detail.entryKey,
              detail.memberSecret,
              vaultKey,
              {
                organizationId: detail.organizationId,
                vaultId: detail.vaultId,
                entryId: detail.id,
                revision: detail.currentRevision,
              },
            ))
          } finally {
            wipe(vaultKey)
          }
          assertUnlockSession(privateKey, cryptoSessionGeneration)

          // The authenticated MemberIndex is only a candidate selector. Recheck
          // the current canonical secret so a stale projection never overwrites
          // a user-selected icon or changes a non-Credential Entry.
          if ((detail.state !== 'active' && detail.state !== 1)
            || previous.entryType !== ENTRY_TYPE_CREDENTIAL
            || previous.content.type !== ENTRY_TYPE_CREDENTIAL
            || previous.iconReference) {
            skipped += 1
          } else {
            const currentHostname = normalizePublicHostname(previous.content.url ?? '')
            const asset = currentHostname === candidate.hostname
              ? assets.get(candidate.hostname)
              : undefined
            if (!asset) {
              skipped += 1
            } else {
              await updateCanonicalEntryNow(vaultId, {
                detail,
                previous,
                cryptoSessionGeneration,
                draft: {
                  memberLabel: previous.memberLabel,
                  agentLabel: previous.agentLabel,
                  ...(previous.description ? { description: previous.description } : {}),
                  ...(previous.color ? { color: previous.color } : {}),
                  iconReference: publicAssetIconReference({
                    assetId: asset.id,
                    revision: asset.revision,
                    url: asset.url,
                  }),
                  entryType: previous.entryType,
                  content: previous.content,
                  policy: previous.agentVisibilityPolicy,
                },
              })
              invalidateCanonicalEntryQueries(queryClient, vaultId, detail.id)
              repaired += 1
            }
          }
        } catch {
          assertUnlockSession(privateKey, cryptoSessionGeneration)
          failed += 1
        }
        input.onProgress?.({
          phase: 'repair',
          done: repaired + failed + skipped - (snapshot.length - ready.length),
          total: ready.length,
        })
      }

      if (ready.length > 0) useMemberSyncStore.getState().retry()
      return { candidates: snapshot.length, repaired, skipped, failed }
    },
    gcTime: 0,
  })

  return { ...mutation, candidateCount: candidates.length }
}
