import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { wipe } from '../../../shared/crypto/sodium'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import type { MemberSecretV1 } from '../../../shared/crypto/vault-plaintext'
import {
  memberSyncItemSchema,
} from './member-sync-api'
import {
  memberSyncCache,
  type MemberSyncCache,
} from './member-sync-cache'
import {
  assertCurrentMemberLeaseValid,
  invalidateMemberSyncGeneration,
} from './member-sync-lifecycle'

export interface OpenCurrentMemberEntryInput {
  userId: string
  vaultId: string
  entryId: string
  expectedRevision: string
  expectedKeyVersion: number
  memberPrivateKey: Uint8Array
  now?: Date
  connected?: boolean
  monotonicTime?: number
}

export async function openCurrentMemberEntrySecret(
  input: OpenCurrentMemberEntryInput,
  cache: MemberSyncCache | null = memberSyncCache,
): Promise<MemberSecretV1> {
  if (!cache) throw new Error('Vault ciphertext cache is unavailable')
  const cached = await cache.readActiveItem(input.userId, input.vaultId, input.entryId)
  if (!cached) throw new Error('Current Member Entry is not available locally')

  try {
    await assertCurrentMemberLeaseValid(
      cache,
      cached,
      input.userId,
      input.now ?? new Date(),
      input.connected,
      input.monotonicTime,
    )
  } catch (error) {
    await invalidateMemberSyncGeneration(cache, input.userId, input.vaultId, cached)
    throw error
  }

  const item = memberSyncItemSchema.parse(cached.item)
  if (item.kind !== 'head'
    || item.currentRevision !== input.expectedRevision
    || item.currentKeyVersion !== input.expectedKeyVersion) {
    throw new Error('Current Member Entry does not match the selected structural head')
  }

  let vaultKey: Uint8Array
  try {
    vaultKey = await openMemberVaultKey(cached.authority.memberVaultKey, input.memberPrivateKey)
  } catch (error) {
    await invalidateMemberSyncGeneration(cache, input.userId, input.vaultId, cached)
    throw error
  }
  try {
    return await openMemberSecret(item.entryKey, item.memberSecret, vaultKey, {
      organizationId: cached.authority.accessContext.organizationId,
      vaultId: input.vaultId,
      entryId: input.entryId,
      revision: item.currentRevision,
    })
  } finally {
    wipe(vaultKey)
  }
}
