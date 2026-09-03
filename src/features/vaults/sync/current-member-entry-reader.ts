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
  repairMemberSyncGeneration,
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

export class CurrentMemberEntryStructuralHeadMismatchError extends Error {
  constructor() {
    super('Current Member Entry does not match the selected structural head')
    this.name = 'CurrentMemberEntryStructuralHeadMismatchError'
  }
}

export function isCurrentMemberEntryStructuralHeadMismatchError(
  error: unknown,
): error is CurrentMemberEntryStructuralHeadMismatchError {
  return error instanceof CurrentMemberEntryStructuralHeadMismatchError
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

  let item: ReturnType<typeof memberSyncItemSchema.parse>
  try {
    item = memberSyncItemSchema.parse(cached.item)
  } catch (error) {
    await repairMemberSyncGeneration(input.userId, input.vaultId, cached, cache)
      .catch(() => undefined)
    throw error
  }
  if (item.kind !== 'head'
    || item.currentRevision !== input.expectedRevision
    || item.currentKeyVersion !== input.expectedKeyVersion) {
    throw new CurrentMemberEntryStructuralHeadMismatchError()
  }

  let vaultKey: Uint8Array
  try {
    vaultKey = await openMemberVaultKey(cached.authority.memberVaultKey, input.memberPrivateKey)
  } catch (error) {
    await invalidateMemberSyncGeneration(cache, input.userId, input.vaultId, cached)
    throw error
  }
  try {
    try {
      return await openMemberSecret(item.entryKey, item.memberSecret, vaultKey, {
        organizationId: cached.authority.accessContext.organizationId,
        vaultId: input.vaultId,
        entryId: input.entryId,
        revision: item.currentRevision,
      })
    } catch (error) {
      await repairMemberSyncGeneration(input.userId, input.vaultId, cached, cache)
        .catch(() => undefined)
      throw error
    }
  } finally {
    wipe(vaultKey)
  }
}
