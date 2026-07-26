import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_GRANT_MANAGE } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import { useOrgGrants } from '../use-org-grants'
import { OrgGrantsPanel } from './org-grants-panel'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('../use-org-grants', () => ({ useOrgGrants: vi.fn() }))
vi.mock('../use-regrant', () => ({ useRegrant: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('../use-revoke-org-grant', () => ({
  useRevokeOrgGrant: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../../agents/components/agent-avatar', () => ({ AgentAvatar: () => <span /> }))

const mockOrgGrants = vi.mocked(useOrgGrants)
const expiredGrant = {
  id: 'grant-1',
  vaultId: 'vault-1',
  vaultName: 'Production',
  agentId: 'agent-1',
  agentName: 'Deploy Agent',
  agentPublicKey: 'public-key',
  type: 'granular' as const,
  status: 'expired' as const,
  entryId: 'entry-1',
  entryLabel: 'Deploy token',
  reason: null,
  expiresAt: '2026-07-01T00:00:00Z',
  queryLimit: null,
  queryCount: 0,
  expirySource: 'time',
  createdAt: '2026-06-01T00:00:00Z',
  createdByName: 'Alice',
  revokedByName: null,
  deniedByName: null,
  revokeReason: null,
  denyReason: null,
  lastAccessedAt: null,
  lastAccessIp: null,
  lastAccessHostname: null,
  canRevoke: false,
  canGrantAgain: true,
}

describe('OrgGrantsPanel regrant boundary', () => {
  beforeEach(() => {
    useAuthStore.setState({ permissions: PERMISSION_GRANT_MANAGE })
    mockOrgGrants.mockReturnValue({
      data: { items: [expiredGrant], nextCursor: null },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)
  })

  it('shows expired history without exposing legacy regrant on protocol 2 Vault tabs', () => {
    render(<OrgGrantsPanel vaultId="vault-1" allowRegrant={false} />)

    expect(screen.getAllByText('Expired')).not.toHaveLength(0)
    expect(screen.getByText('Deploy token')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Grant again' })).not.toBeInTheDocument()
  })

  it('keeps regrant available on legacy surfaces until their migration task lands', () => {
    render(<OrgGrantsPanel vaultId="vault-1" />)
    expect(screen.getByRole('button', { name: 'Grant again' })).toBeInTheDocument()
  })
})
