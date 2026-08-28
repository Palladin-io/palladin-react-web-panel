import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEntry: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  openMemberSecret: vi.fn(),
  openReason: vi.fn(),
  listFields: vi.fn(),
  wipe: vi.fn(),
}))

vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.openMemberSecret }))
vi.mock('../../shared/crypto/reason-protocol', () => ({ openEncryptedReason: mocks.openReason }))
vi.mock('../../shared/crypto/grant-protocol', () => ({ listGrantableFields: mocks.listFields }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))

import { ENVELOPE_PURPOSE } from '../../shared/crypto/envelope'
import { useAuthStore } from '../auth'
import type { PendingGrant } from './api/pending-grants-api'
import { GrantReviewUnavailableError, useGrantApprovalReview } from './use-grant-approval-review'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false },
  } })}>{children}</QueryClientProvider>
}

const grant = {
  id: '77777777-7777-4777-8777-777777777777',
  vaultId: '22222222-2222-4222-8222-222222222222',
  entryId: '33333333-3333-4333-8333-333333333333',
  agentId: '55555555-5555-4555-8555-555555555555',
  agentSigningPublicKey: 'signing-public-key',
  agentSigningKeyVersion: 2,
  agentSigningKeyFingerprint: 'fingerprint',
  encryptedReason: {
    descriptor: {
      scope: {
        organizationId: '11111111-1111-4111-8111-111111111111',
        vaultId: '22222222-2222-4222-8222-222222222222',
        entryId: '33333333-3333-4333-8333-333333333333',
        agentId: '55555555-5555-4555-8555-555555555555',
        grantOrRequestId: '77777777-7777-4777-8777-777777777777',
      },
      binding: { recipientKeyVersion: 4 },
    },
  },
} as PendingGrant

describe('useGrantApprovalReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3) })
    mocks.getVault.mockResolvedValue({
      memberVaultKey: {},
      currentKeyEpoch: { agentMessageKeyVersion: 4 },
      vaultPrivateKeys: [{
        descriptor: { purpose: ENVELOPE_PURPOSE.agentMessagePrivateByVk, keyVersion: 4 },
      }],
    })
    mocks.getEntry.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      currentRevision: '7',
      state: 'active',
      entryKey: {},
      memberSecret: {},
    })
  })

  it('keeps a pending credit-card request denyable but unavailable for approval', async () => {
    mocks.openMemberSecret.mockResolvedValue({
      schemaVersion: 1,
      entryType: 'creditCard',
      content: {},
    })
    const { result } = renderHook(() => useGrantApprovalReview(grant), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(GrantReviewUnavailableError)
    expect((result.current.error as GrantReviewUnavailableError).stage).toBe('preflight')
    expect(mocks.openReason).not.toHaveBeenCalled()
    expect(mocks.listFields).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })
})
