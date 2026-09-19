import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_GRANT_MANAGE } from '../../../shared/lib/permissions'
import { useMemberSyncStore } from '../../vaults/sync/member-sync-store'
import { useOrgGrants } from '../use-org-grants'
import { OrgGrantsPanel } from './org-grants-panel'

const authState = vi.hoisted(() => ({ permissions: 0 }))
const getAgent = vi.hoisted(() => vi.fn())
const createGrantMutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('../../auth', () => ({
  useAuthStore: (selector: (state: { permissions: number }) => unknown) => selector(authState),
}))
vi.mock('../../agents', () => ({ getAgent }))
vi.mock('../use-org-grants', () => ({ useOrgGrants: vi.fn() }))
vi.mock('../use-grant-reasons', () => ({
  useGrantReasons: () => new Map([
    ['["grant-1","vault-1","entry-1","agent-1"]', 'Deploy the release'],
  ]),
}))
vi.mock('../use-create-grant', () => ({ useCreateGrant: () => createGrantMutation }))
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
  entryScopes: [{ entryId: 'entry-1', fieldIds: ['key.value'], fieldSelectionMode: 'selected', selectedFieldIds: ['key.value'] }],
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
    getAgent.mockReset()
    createGrantMutation.mutate.mockReset()
    useMemberSyncStore.setState({
      status: 'ready',
      vaults: new Map([['vault-1', {
        vaultId: 'vault-1',
        metadata: { name: 'Personal' },
        structure: {},
        entries: new Map(),
        appliedThroughSequence: '0',
        status: 'ready',
        failureKind: null,
      } as never]]),
    })
    mockOrgGrants.mockReturnValue({
      data: { items: [expiredGrant], nextCursor: null },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)
  })

  it('keeps a future grant type visible without offering an unsupported regrant flow', () => {
    mockOrgGrants.mockReturnValue({
      data: { items: [{ ...expiredGrant, type: 'future' }], nextCursor: null },
      isPending: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)
    render(<OrgGrantsPanel vaultId="vault-1" />)
    expect(screen.getByText('Deploy token')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grant again' })).toBeDisabled()
  })

  it('offers regrant on protocol 2 Vault tabs', () => {
    render(<OrgGrantsPanel vaultId="vault-1" />)

    expect(screen.getAllByText('Expired')).not.toHaveLength(0)
    expect(screen.getByText('Deploy token')).toBeInTheDocument()
    expect(screen.getByText('Deploy the release')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grant again' })).toBeInTheDocument()
  })

  it('uses the Agent current recipient key for a granular regrant', async () => {
    getAgent.mockResolvedValue({
      publicKey: 'current-public-key', recipientKeyVersion: 7, accessEpoch: 3,
    })
    const user = userEvent.setup()
    render(<OrgGrantsPanel vaultId="vault-1" />)

    await user.click(screen.getByRole('button', { name: 'Grant again' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Grant again' }))
      .getByRole('button', { name: 'Grant access' }))

    await waitFor(() => expect(createGrantMutation.mutate).toHaveBeenCalledTimes(1))
    expect(getAgent).toHaveBeenCalledWith('agent-1')
    expect(createGrantMutation.mutate.mock.calls[0][0]).toEqual(expect.objectContaining({
      fieldSelection: { mode: 'selected', fieldIds: ['key.value'] },
      agentPublicKey: 'current-public-key',
      recipientAgentKeyVersion: 7,
      agentAccessEpoch: 3,
    }))
  })

  it('keeps the dialog locked while resolving the current Agent key', async () => {
    let resolveAgent!: (agent: {
      publicKey: string
      recipientKeyVersion: number
      accessEpoch: number
    }) => void
    getAgent.mockReturnValue(new Promise((resolve) => { resolveAgent = resolve }))
    const user = userEvent.setup()
    render(<OrgGrantsPanel vaultId="vault-1" />)

    await user.click(screen.getByRole('button', { name: 'Grant again' }))
    const dialog = screen.getByRole('dialog', { name: 'Grant again' })
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }))

    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled())
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()

    resolveAgent({ publicKey: 'current-public-key', recipientKeyVersion: 7, accessEpoch: 3 })
    await waitFor(() => expect(createGrantMutation.mutate).toHaveBeenCalledTimes(1))
  })

  it('names the entire Vault scope when confirming a FULL regrant', async () => {
    mockOrgGrants.mockReturnValue({
      data: {
        items: [{ ...expiredGrant, type: 'full', entryId: null, entryLabel: null }],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)
    const user = userEvent.setup()
    render(<OrgGrantsPanel vaultId="vault-1" />)

    await user.click(screen.getByRole('button', { name: 'Grant again' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Grant again' }))
    expect(dialog.getByText('Personal').closest('p')).toHaveTextContent(
      'access to the entire vault Personal',
    )
    expect(dialog.queryByText('this entry')).not.toBeInTheDocument()
  })

  it('uses the Agent current key context for a FULL regrant', async () => {
    getAgent.mockResolvedValue({
      publicKey: 'current-public-key', recipientKeyVersion: 7, accessEpoch: 3,
    })
    mockOrgGrants.mockReturnValue({
      data: {
        items: [{ ...expiredGrant, type: 'full', entryId: null, entryLabel: null }],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)
    const user = userEvent.setup()
    render(<OrgGrantsPanel vaultId="vault-1" />)

    await user.click(screen.getByRole('button', { name: 'Grant again' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Grant again' }))
      .getByRole('button', { name: 'Grant access' }))

    await waitFor(() => expect(createGrantMutation.mutate).toHaveBeenCalledTimes(1))
    expect(getAgent).toHaveBeenCalledWith('agent-1')
    expect(createGrantMutation.mutate.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'full',
      agentPublicKey: 'current-public-key',
      recipientAgentKeyVersion: 7,
      agentAccessEpoch: 3,
    }))
  })

  it('resolves an encrypted FULL Vault name from the unlocked member store', () => {
    mockOrgGrants.mockReturnValue({
      data: {
        items: [{
          ...expiredGrant,
          type: 'full',
          status: 'active',
          vaultName: null,
          entryId: null,
          entryLabel: null,
          canRevoke: true,
          canGrantAgain: false,
        }],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)

    render(<OrgGrantsPanel vaultId="vault-1" />)

    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
  })

  it('prefers the current decrypted Vault name over a stale projection name', () => {
    mockOrgGrants.mockReturnValue({
      data: {
        items: [{
          ...expiredGrant,
          type: 'full',
          status: 'active',
          vaultName: 'Old name',
          entryId: null,
          entryLabel: null,
          canRevoke: true,
          canGrantAgain: false,
        }],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)

    render(<OrgGrantsPanel vaultId="vault-1" />)

    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.queryByText('Old name')).not.toBeInTheDocument()
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

  it('does not infer terminal guidance from an additive grant state', () => {
    mockOrgGrants.mockReturnValue({
      data: {
        items: [{ ...expiredGrant, status: 'suspending', canGrantAgain: false }],
        nextCursor: null,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useOrgGrants>)

    render(<OrgGrantsPanel vaultId="vault-1" />)

    expect(screen.getByText('Unknown status')).toBeInTheDocument()
    expect(screen.queryByText('Grant again unavailable')).not.toBeInTheDocument()
    expect(screen.queryByText('Active in a newer grant')).not.toBeInTheDocument()
  })
})
