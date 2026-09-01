import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EncryptedVaultSummary } from './member-sync-api'
import type { CachedCurrentMemberEntry, MemberSyncCache } from './member-sync-cache'
import validSnapshotFixture from './__fixtures__/cvt-557-valid-snapshot.json'

const cryptoMocks = vi.hoisted(() => ({
  openMemberVaultKey: vi.fn(async () => new Uint8Array(32).fill(7)),
  openMemberSecret: vi.fn(async () => ({ schema: 'palladin.member-secret.v1' })),
  wipe: vi.fn(),
}))

vi.mock('../../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: cryptoMocks.openMemberVaultKey,
}))
vi.mock('../../../shared/crypto/entry-protocol', () => ({
  openMemberSecret: cryptoMocks.openMemberSecret,
}))
vi.mock('../../../shared/crypto/sodium', () => ({ wipe: cryptoMocks.wipe }))

import {
  isCurrentMemberEntryStructuralHeadMismatchError,
  openCurrentMemberEntrySecret,
} from './current-member-entry-reader'
import { memberSyncItemSchema } from './member-sync-api'
import { useMemberSyncStore } from './member-sync-store'

const userId = validSnapshotFixture.requestAuthority.authenticatedPrincipalId
const vaultId = validSnapshotFixture.requestAuthority.routeVaultId
const entryId = validSnapshotFixture.requestAuthority.authoritativeEntryHeads[0].entryId

function cachedEntry(): CachedCurrentMemberEntry {
  return {
    namespace: 'active',
    appliedThroughSequence: validSnapshotFixture.response.snapshotBaseSequence,
    vault: {
      id: vaultId,
      memberKeyGeneration: validSnapshotFixture.requestAuthority.authoritativeMemberKeyGeneration,
      currentKeyEpoch: {
        vaultKeyVersion: validSnapshotFixture.requestAuthority.authoritativeCurrentVaultKeyVersion,
      },
      memberVaultKey: validSnapshotFixture.response.memberVaultKey,
    } as EncryptedVaultSummary,
    authority: {
      accessContext: validSnapshotFixture.response.accessContext,
      memberVaultKey: validSnapshotFixture.response.memberVaultKey,
    },
    // The engine validates and normalizes the wire response before writing it
    // to IndexedDB. Model the same parse-before-cache lifecycle here so the
    // reader test catches non-idempotent contract transforms.
    item: memberSyncItemSchema.parse(validSnapshotFixture.response.items[0]),
  } as CachedCurrentMemberEntry
}

function cacheWith(entry: CachedCurrentMemberEntry | null) {
  return {
    readActiveItem: vi.fn(async () => entry),
    removeActiveGeneration: vi.fn(async () => true),
    validateAndObserveActiveClock: vi.fn(async (
      _userId: string,
      _vaultId: string,
      _namespace: string,
      _expectedAppliedThroughSequence: string,
      _expectedAuthority: unknown,
      _currentWallTime: number,
      candidateMaximumWallTime: number,
    ) => candidateMaximumWallTime),
  } as unknown as MemberSyncCache & {
    readActiveItem: ReturnType<typeof vi.fn>
    removeActiveGeneration: ReturnType<typeof vi.fn>
    validateAndObserveActiveClock: ReturnType<typeof vi.fn>
  }
}

function input() {
  return {
    userId,
    vaultId,
    entryId,
    expectedRevision: '12',
    expectedKeyVersion: 5,
    memberPrivateKey: new Uint8Array(32).fill(3),
    now: new Date('2026-08-29T08:30:00Z'),
  }
}

describe('current Member Entry reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMemberSyncStore.getState().clear()
  })

  it('opens only the selected cached MemberSecret without a transport request', async () => {
    const cache = cacheWith(cachedEntry())

    await expect(openCurrentMemberEntrySecret(input(), cache)).resolves.toMatchObject({
      schema: 'palladin.member-secret.v1',
    })

    expect(cache.readActiveItem).toHaveBeenCalledTimes(1)
    expect(cryptoMocks.openMemberVaultKey).toHaveBeenCalledTimes(1)
    expect(cryptoMocks.openMemberSecret).toHaveBeenCalledTimes(1)
    expect(cryptoMocks.wipe).toHaveBeenCalledTimes(1)
    expect(cache.removeActiveGeneration).not.toHaveBeenCalled()
  })

  it('rejects an item when its active generation advances before lease validation', async () => {
    const entry = cachedEntry()
    const cache = cacheWith(entry)
    cache.validateAndObserveActiveClock.mockRejectedValueOnce(
      new Error('Vault active generation changed while validating its lease'),
    )
    cache.removeActiveGeneration.mockResolvedValueOnce(false)

    await expect(openCurrentMemberEntrySecret(input(), cache)).rejects.toThrow('active generation changed')

    expect(cache.validateAndObserveActiveClock).toHaveBeenCalledWith(
      userId,
      vaultId,
      entry.namespace,
      entry.appliedThroughSequence,
      entry.authority,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
    expect(cryptoMocks.openMemberVaultKey).not.toHaveBeenCalled()
    expect(cache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, entry)
    expect(useMemberSyncStore.getState().status).toBe('idle')
  })

  it('fails closed and purges the generation at the exact lease expiry', async () => {
    const cache = cacheWith(cachedEntry())

    await expect(openCurrentMemberEntrySecret({
      ...input(), now: new Date('2026-08-30T08:00:00Z'),
    }, cache)).rejects.toThrow('lease is not valid')

    expect(cache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, expect.anything())
    expect(cryptoMocks.openMemberVaultKey).not.toHaveBeenCalled()
    expect(useMemberSyncStore.getState().status).toBe('error')
  })

  it('allows disabled-policy ciphertext only while the client is connected', async () => {
    const connectedEntry = cachedEntry()
    connectedEntry.authority = structuredClone(connectedEntry.authority)
    connectedEntry.authority.accessContext.offlinePolicy = 'disabled'
    connectedEntry.authority.accessContext.notAfter = connectedEntry.authority.accessContext.issuedAt
    const connectedCache = cacheWith(connectedEntry)

    await expect(openCurrentMemberEntrySecret({
      ...input(), connected: true,
    }, connectedCache)).resolves.toMatchObject({ schema: 'palladin.member-secret.v1' })

    const disconnectedEntry = cachedEntry()
    disconnectedEntry.authority = structuredClone(disconnectedEntry.authority)
    disconnectedEntry.authority.accessContext.offlinePolicy = 'disabled'
    disconnectedEntry.authority.accessContext.notAfter = disconnectedEntry.authority.accessContext.issuedAt
    const disconnectedCache = cacheWith(disconnectedEntry)
    await expect(openCurrentMemberEntrySecret({
      ...input(), connected: false,
    }, disconnectedCache)).rejects.toThrow('lease is not valid')
    expect(disconnectedCache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, disconnectedEntry)
  })

  it('rejects a process-clock rollback beyond five minutes before opening keys', async () => {
    const cache = cacheWith(cachedEntry())
    await openCurrentMemberEntrySecret({
      ...input(),
      now: new Date('2026-08-29T09:00:00Z'),
      monotonicTime: 1_000,
    }, cache)

    await expect(openCurrentMemberEntrySecret({
      ...input(),
      now: new Date('2026-08-29T08:54:59Z'),
      monotonicTime: 2_000,
    }, cache)).rejects.toThrow('clock rollback')
    expect(cache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, expect.anything())
  })

  it('isolates a structural revision mismatch to the selected Entry', async () => {
    const cache = cacheWith(cachedEntry())

    const error = await openCurrentMemberEntrySecret({
      ...input(), expectedRevision: '13',
    }, cache).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('structural head')
    expect(isCurrentMemberEntryStructuralHeadMismatchError(error)).toBe(true)
    expect(cache.removeActiveGeneration).not.toHaveBeenCalled()
    expect(cryptoMocks.openMemberVaultKey).not.toHaveBeenCalled()
    expect(useMemberSyncStore.getState().status).toBe('idle')
  })

  it('purges a foreign access scope and repairs the generation containing corrupt Entry ciphertext', async () => {
    const foreign = cachedEntry()
    foreign.authority = structuredClone(foreign.authority)
    foreign.authority.accessContext.vaultId = '99999999-9999-4999-8999-999999999999'
    const foreignCache = cacheWith(foreign)
    await expect(openCurrentMemberEntrySecret(input(), foreignCache)).rejects.toThrow()
    expect(foreignCache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, foreign)

    const corrupt = cachedEntry()
    corrupt.item = structuredClone(corrupt.item)
    if (corrupt.item?.kind === 'head') corrupt.item.memberSecret.encodedSuitePayload = ''
    const corruptCache = cacheWith(corrupt)
    await expect(openCurrentMemberEntrySecret(input(), corruptCache)).rejects.toThrow()
    expect(corruptCache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, corrupt)
  })

  it('repairs exactly the generation whose MemberSecret fails authentication', async () => {
    const failed = cachedEntry()
    const cache = cacheWith(failed)
    cryptoMocks.openMemberSecret.mockRejectedValueOnce(new Error('invalid MemberSecret'))

    await expect(openCurrentMemberEntrySecret(input(), cache)).rejects.toThrow('invalid MemberSecret')

    expect(cache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, failed)
    expect(cryptoMocks.wipe).toHaveBeenCalledTimes(1)
  })

  it('purges a Vault generation when its Member Vault key cannot be opened', async () => {
    const entry = cachedEntry()
    const cache = cacheWith(entry)
    cryptoMocks.openMemberVaultKey.mockRejectedValueOnce(new Error('invalid Member Vault key'))

    await expect(openCurrentMemberEntrySecret(input(), cache)).rejects.toThrow('invalid Member Vault key')

    expect(cache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, entry)
    expect(cryptoMocks.openMemberSecret).not.toHaveBeenCalled()
  })
})
