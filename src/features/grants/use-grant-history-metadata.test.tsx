import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { OrgGrant } from './api/org-grants-api'
import { grantReasonCoordinateKey } from './grant-reason-coordinate'
import { grantHistoryCoordinateKey, useGrantHistoryMetadata } from './use-grant-history-metadata'

const mocks = vi.hoisted(() => ({
  getGrants: vi.fn(),
  directory: vi.fn(),
  reasons: vi.fn(),
}))
vi.mock('./api/org-grants-api', () => ({ getOrgGrants: mocks.getGrants }))
vi.mock('./use-grant-reasons', () => ({ useGrantReasons: mocks.reasons }))
vi.mock('../auth', () => ({ useAuthStore: (selector: (state: object) => unknown) => selector({ accessToken: null }) }))
vi.mock('../../shared/lib/organization-scope', () => ({ organizationIdFromAccessToken: () => 'org-1' }))
vi.mock('../../shared/hooks/use-organization-member-directory', () => ({ useOrganizationMemberDirectory: mocks.directory }))
vi.mock('../vaults/api/vault-members-api', () => ({ getVaultMembers: async () => ({ items: [], nextAfterId: null }) }))

const coordinate = { type: 'grant_approved' as const, grantId: 'g1', vaultId: 'v1', entryId: 'e1', agentId: 'a1' }
const actorId = '11111111-1111-4111-8111-111111111111'
const grant = { id: 'g1', vaultId: 'v1', entryId: 'e1', agentId: 'a1', status: 'expired', createdBy: actorId } as OrgGrant

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mocks.getGrants.mockReset().mockResolvedValue({ items: [grant], nextCursor: null })
  mocks.directory.mockReset().mockReturnValue({ nameById: { [actorId]: 'Former approver' } })
  mocks.reasons.mockReset().mockImplementation((rows: OrgGrant[]) => new Map(rows.map(row => [grantReasonCoordinateKey(row), 'Synthetic login test'])))
})

describe('grant history metadata', () => {
  it('keeps the reason and resolves a former approver after the grant expires', async () => {
    const { result } = renderHook(() => useGrantHistoryMetadata([coordinate]), { wrapper })
    await waitFor(() => expect(result.current.get(grantHistoryCoordinateKey(coordinate))).toEqual({
      reason: 'Synthetic login test', actorName: 'Former approver',
    }))
    expect(mocks.directory).toHaveBeenCalledWith('org-1', [actorId], true)
  })

  it('finds the historical grant beyond the first page', async () => {
    mocks.getGrants.mockResolvedValueOnce({ items: [], nextCursor: 'older' })
    const { result } = renderHook(() => useGrantHistoryMetadata([coordinate]), { wrapper })
    await waitFor(() => expect(result.current.get(grantHistoryCoordinateKey(coordinate))?.reason).toBe('Synthetic login test'))
    expect(mocks.getGrants).toHaveBeenCalledWith({ vaultId: 'v1', pageSize: 100, cursor: 'older' })
  })

  it('does not enrich a notification with a different Entry coordinate', async () => {
    const mismatched = { ...coordinate, entryId: 'other-entry' }
    const { result } = renderHook(() => useGrantHistoryMetadata([mismatched]), { wrapper })
    await waitFor(() => expect(mocks.reasons).toHaveBeenCalledWith([grant]))
    expect(result.current.size).toBe(0)
  })
})
