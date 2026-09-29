import { beforeEach, describe, expect, it, vi } from 'vitest'
import { changeEntryShareProtection, createEntryShare, issueShareCreationChallenge, listEntryShares, revokeEntryShare } from './sharing-api'
import { sharingId, sharingListItem, sharingScope } from './sharing-test-fixtures'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn() }))
vi.mock('../../../shared/api/client', () => ({ api: mocks }))
beforeEach(() => vi.resetAllMocks())
const path = `api/vaults/${sharingScope.vaultId}/entries/${sharingScope.entryId}/sharing`

describe('Entry sharing HTTP contracts', () => {
  it('changes protection without secret-bearing errors, redirects or retries', async () => {
    const signal = new AbortController().signal
    await changeEntryShareProtection(sharingScope.vaultId, sharingScope.entryId, sharingId, 'none', null, signal)
    expect(mocks.put).toHaveBeenCalledWith(`${path}/${sharingId}/protection`, {
      signal, cache: 'no-store', retry: 0, redirect: 'error', json: { protection: 'none', protectionSecret: null },
    })
    mocks.put.mockRejectedValue(new Error('synthetic-secret-in-transport-error'))
    await expect(changeEntryShareProtection(sharingScope.vaultId, sharingScope.entryId, sharingId, 'pin', '123456', signal))
      .rejects.toThrow('Sharing protection unavailable')
  })
  it('projects create fields explicitly, excluding accidental keys and plaintext', async () => {
    const signal = new AbortController().signal
    const input = {
      shareId: sharingId, sourceRevision: '4', expiresAt: '2026-09-21T12:00:00Z', maximumReceipts: 1,
      recipientMode: 'namedRecipient' as const, recipientEmail: 'recipient@example.test', protection: 'none' as const,
      protectionSecret: null, accessToken: 'synthetic-access-bearer', nonce: 'synthetic-nonce', ciphertext: 'synthetic-ciphertext',
      notifyOnFirstReceipt: true, key: new Uint8Array(32).fill(8), plaintext: 'must-not-be-sent',
    }
    await createEntryShare(sharingScope.vaultId, sharingScope.entryId, input, signal)
    expect(mocks.post).toHaveBeenCalledWith(path, {
      signal, retry: 0, cache: 'no-store', redirect: 'error', json: {
        shareId: sharingId, sourceRevision: '4', expiresAt: input.expiresAt, maximumReceipts: 1,
        recipientMode: 'namedRecipient', recipientEmail: input.recipientEmail, protection: 'none', protectionSecret: null,
        accessToken: input.accessToken, nonce: input.nonce, ciphertext: input.ciphertext, notifyOnFirstReceipt: true,
      },
    })
  })

  it('preserves server metadata and forward-compatible status values without rejecting a list', async () => {
    const response = { items: [sharingListItem, { ...sharingListItem, status: 'future-state', protection: 'future-gate' }], nextCursor: 'opaque' }
    mocks.get.mockReturnValue({ json: async () => response })
    const signal = new AbortController().signal
    expect(await listEntryShares(sharingScope.vaultId, sharingScope.entryId, 'cursor', signal)).toBe(response)
    expect(mocks.get).toHaveBeenCalledWith(path, { signal, cache: 'no-store', searchParams: { cursor: 'cursor' } })
  })

  it('uses the separate authenticated challenge and revoke routes', async () => {
    mocks.post.mockReturnValue({ json: async () => ({ shareId: sharingId, sourceRevision: '4', expiresAt: '2026-09-20T12:05:00Z' }) })
    const signal = new AbortController().signal
    await issueShareCreationChallenge(sharingScope.vaultId, sharingScope.entryId, signal)
    expect(mocks.post).toHaveBeenCalledWith(`${path}/creation-challenge`, expect.objectContaining({ signal, retry: 0, json: {} }))
    await revokeEntryShare(sharingScope.vaultId, sharingScope.entryId, sharingId, signal)
    expect(mocks.delete).toHaveBeenCalledWith(`${path}/${sharingId}`, expect.objectContaining({ signal, retry: 0 }))
  })
})
