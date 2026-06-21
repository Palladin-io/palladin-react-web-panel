import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mutateMock = vi.fn()
let isPending = false
vi.mock('../use-create-grant', () => ({
  useCreateGrant: () => ({
    mutate: mutateMock,
    get isPending() {
      return isPending
    },
  }),
}))

const getAgent = vi.hoisted(() => vi.fn())
vi.mock('../../agents', () => ({
  AGENT_STATUS_ACTIVE: 'active',
  getAgent,
  useAgents: () => ({
    data: [
      { agentId: 'a1', name: 'Deploy Bot', status: 'active' },
      { agentId: 'a2', name: 'Covered Bot', status: 'active' },
      { agentId: 'a3', name: 'Pending Bot', status: 'pending' },
    ],
  }),
}))

// Active grant covering agent a2 in this vault.
vi.mock('../use-org-grants', () => ({
  useOrgGrants: () => ({
    data: { items: [{ id: 'g', vaultId: 'v1', agentId: 'a2', status: 'active', type: 'full' }] },
  }),
}))

vi.mock('../../vaults/api/vault-api', () => ({ getVaults: vi.fn() }))
vi.mock('../api/entry-search-api', () => ({ searchEntries: vi.fn() }))

const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

import { GrantAccessDialog } from './grant-access-dialog'

describe('GrantAccessDialog (agent-for-vault)', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    getAgent.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    isPending = false
  })

  function renderDialog() {
    render(
      <GrantAccessDialog mode={{ kind: 'agent-for-vault', vaultId: 'v1' }} onClose={vi.fn()} />,
    )
  }

  it('renders the title, agent picker, and access-type dropdown', () => {
    renderDialog()
    expect(screen.getByText('Grant Access')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Agent' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Access type/i)).toBeInTheDocument()
  })

  it('excludes agents already covered by an active grant, and pending agents', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('combobox', { name: 'Agent' }))
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.queryByText('Covered Bot')).not.toBeInTheDocument() // active grant
    expect(screen.queryByText('Pending Bot')).not.toBeInTheDocument() // not active
  })

  it('happy path: picks agent, resolves public key, calls mutation', async () => {
    getAgent.mockResolvedValue({ agentId: 'a1', publicKey: 'PUBKEY' })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('combobox', { name: 'Agent' }))
    await user.click(screen.getByText('Deploy Bot'))
    // Default policy = Time Limited (pre-filled ~1 day ahead); replace with a fixed future expiry.
    await user.clear(screen.getByLabelText(/Expiry date/i))
    await user.type(screen.getByLabelText(/Expiry date/i), '2030-01-01T10:00')
    await user.click(screen.getByRole('button', { name: /^grant access$/i }))

    await waitFor(() => expect(mutateMock).toHaveBeenCalled())
    const input = mutateMock.mock.calls[0][0]
    expect(input.agentId).toBe('a1')
    expect(input.agentPublicKey).toBe('PUBKEY')
    expect(input.type).toBe('full')
    expect(input.policy).toHaveProperty('expiresAt')
  })

  it('blocks submit when no subject is chosen', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /^grant access$/i }))
    expect(screen.getByText(/choose who or what to grant/i)).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })
})
