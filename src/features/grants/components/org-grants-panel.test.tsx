import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_GRANT_MANAGE } from '../../../shared/lib/permissions'
import { useOrgGrants } from '../use-org-grants'
import { OrgGrantsPanel } from './org-grants-panel'

const authState = vi.hoisted(() => ({ permissions: 0 }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('../../auth', () => ({
  useAuthStore: (selector: (state: { permissions: number }) => unknown) => selector(authState),
}))
vi.mock('../use-org-grants', () => ({ useOrgGrants: vi.fn() }))
vi.mock('../use-grant-reasons', () => ({
  useGrantReasons: () => new Map([['grant-1', 'Deploy the release']]),
}))
vi.mock('../use-create-grant', () => ({ useCreateGrant: () => ({ mutate: vi.fn(), isPending: false }) }))
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
  activeCoveringGrantIds: [],
}

describe('OrgGrantsPanel footer actions', () => {
  beforeEach(() => {
    authState.permissions = PERMISSION_GRANT_MANAGE
    mockOrgGrants.mockReturnValue({
      data: { items: [expiredGrant], nextCursor: null },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)
  })

  it('offers regrant on protocol 2 Vault tabs', () => {
    render(<OrgGrantsPanel vaultId="vault-1" />)

    expect(screen.getAllByText('Expired')).not.toHaveLength(0)
    expect(screen.getByText('Deploy token')).toBeInTheDocument()
    expect(screen.getByText('Deploy the release')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grant again' })).toBeInTheDocument()
  })

  it('links from terminal history to the newer active grant', () => {
    mockOrgGrants.mockReturnValue({
      data: {
        items: [{
          ...expiredGrant,
          canGrantAgain: false,
          activeCoveringGrantIds: ['11111111-1111-4111-8111-111111111111'],
        }],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)

    const { container } = render(<OrgGrantsPanel vaultId="vault-1" />)
    expect(screen.getByText('Active in a newer grant')).toBeInTheDocument()
    expect(screen.getByText('Show active grant')).toBeInTheDocument()
    expect(container.querySelectorAll('[class*="bg-[var(--cv-card-footer)]"]')).toHaveLength(1)
  })

  it('links to an Agent when regrant is otherwise unavailable', () => {
    mockOrgGrants.mockReturnValue({
      data: {
        items: [{ ...expiredGrant, canGrantAgain: false }],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)

    render(<OrgGrantsPanel vaultId="vault-1" />)
    expect(screen.getByText('Grant again unavailable')).toBeInTheDocument()
    expect(screen.getByText('View agent')).toBeInTheDocument()
  })
})
