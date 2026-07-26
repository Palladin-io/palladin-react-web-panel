import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultMembersTab } from './vault-members-tab'

const memberHooks = vi.hoisted(() => ({
  useVaultMembers: vi.fn(),
  useRequestMemberRemoval: vi.fn(),
}))
const pendingRotations = vi.hoisted(() => vi.fn())
const rotationStore = vi.hoisted(() => vi.fn())

vi.mock('../use-vault-members', () => memberHooks)
vi.mock('../use-pending-rotations', () => ({ usePendingRotations: pendingRotations }))
vi.mock('../rotation/rotation-store', () => ({ useRotationStore: rotationStore }))
vi.mock('../../auth', () => ({
  useAuthStore: (selector: (state: { permissions: number }) => unknown) =>
    selector({ permissions: 10 }),
}))

const activeMember = {
  memberId: '123e4567-e89b-42d3-a456-426614174000',
  memberName: 'Alice Admin',
  addedAt: '2026-07-26T09:00:00Z',
  deprovisioningStatus: 'Active' as const,
  rotationId: null,
}

function membersResult(member = activeMember) {
  return {
    data: { pages: [{ items: [member], nextAfterId: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }
}

describe('VaultMembersTab', () => {
  beforeEach(() => {
    memberHooks.useVaultMembers.mockReturnValue(membersResult())
    memberHooks.useRequestMemberRemoval.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    })
    pendingRotations.mockReturnValue({ data: [] })
    rotationStore.mockReturnValue({ phase: 'idle', rotationId: null })
  })

  it('keeps a waiting member visible and states that access is still effective', () => {
    memberHooks.useVaultMembers.mockReturnValue(membersResult({
      ...activeMember,
      deprovisioningStatus: 'WaitingForRotation',
      rotationId: '223e4567-e89b-42d3-a456-426614174000',
    }))

    render(<VaultMembersTab vaultId="vault-1" memberCount={2} />)

    expect(screen.getByText('Alice Admin')).toBeInTheDocument()
    expect(screen.getByText('Rotation pending')).toBeInTheDocument()
    expect(screen.getByText(/Access remains effective until this Vault's rotation commits/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('renders the last-capable-member blocker and cannot bypass it', () => {
    memberHooks.useVaultMembers.mockReturnValue(membersResult({
      ...activeMember,
      deprovisioningStatus: 'BlockedLastMember',
    }))

    render(<VaultMembersTab vaultId="vault-1" memberCount={1} />)

    expect(screen.getByText('Safety blocked')).toBeInTheDocument()
    expect(screen.getByText(/leave no capable member/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('describes removal as staged before sending the request', () => {
    render(<VaultMembersTab vaultId="vault-1" memberCount={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Access is removed only after every affected Vault rotation commits/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request removal' })).toBeEnabled()
  })
})
