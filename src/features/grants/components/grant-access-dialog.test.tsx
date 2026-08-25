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
vi.mock('../use-local-entry-search', () => ({ useLocalEntrySearch: () => [] }))

const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

import { GrantAccessDialog } from './grant-access-dialog'
import { useMemberSyncStore } from '../../../shared/stores/member-sync-store'

describe('GrantAccessDialog (agent-for-vault)', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    getAgent.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    isPending = false
    useMemberSyncStore.setState({
      status: 'ready',
      vaults: new Map([['v1', {
        vaultId: 'v1', status: 'ready', entries: new Map(), failureKind: null,
        metadata: { name: 'Production Vault' },
        structure: { entryCount: 3 }, appliedThroughSequence: '0',
      } as never]]),
    })
  })

  function renderDialog() {
    render(
      <GrantAccessDialog mode={{ kind: 'agent-for-vault', vaultId: 'v1' }} onClose={vi.fn()} />,
    )
  }

  it('renders the title, agent picker, and access-type dropdown', () => {
    renderDialog()
    expect(screen.getByText('Grant Access')).toBeInTheDocument()
    const entryCount = screen.getByText('3')
    const vaultName = screen.getByText('“Production Vault”')
    expect(entryCount.tagName).toBe('STRONG')
    expect(vaultName.tagName).toBe('STRONG')
    expect(entryCount.parentElement).toHaveClass('text-meta')
    expect(entryCount.parentElement).toHaveTextContent(
      /access to all 3 current entries in vault “Production Vault”/i,
    )
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

  it('happy path: resolves the authoritative FULL recipient before wrapping the Vault key', async () => {
    getAgent.mockResolvedValue({
      agentId: 'a1',
      publicKey: 'PUBKEY',
      recipientKeyVersion: 4,
      accessEpoch: 7,
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('combobox', { name: 'Agent' }))
    await user.click(screen.getByText('Deploy Bot'))
    expect(screen.queryByText(/cryptographic access to every current and future entry/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^grant access$/i })).toHaveClass('bg-[var(--cv-primary)]')
    // Default policy = Time Limited, pre-filled ~1 day ahead — already a valid future expiry.
    await user.click(screen.getByRole('button', { name: /^grant access$/i }))

    await waitFor(() => expect(mutateMock).toHaveBeenCalled())
    const input = mutateMock.mock.calls[0][0]
    expect(input.agentId).toBe('a1')
    expect(input.agentPublicKey).toBe('PUBKEY')
    expect(input.recipientAgentKeyVersion).toBe(4)
    expect(input.agentAccessEpoch).toBe(7)
    expect(input.type).toBe('full')
    expect(input.policy).toHaveProperty('expiresAt')
    expect(getAgent).toHaveBeenCalledWith('a1')
  })

  it('keeps the selected methods for a vault containing a credit card', async () => {
    useMemberSyncStore.setState({
      vaults: new Map([['v1', {
        vaultId: 'v1', status: 'ready', failureKind: null, metadata: null, structure: {},
        appliedThroughSequence: '0', entries: new Map([['card', {
          state: 'active', corrupt: false, payload: { entryType: 'creditCard' },
        }]]),
      } as never]]),
    })
    getAgent.mockResolvedValue({ agentId: 'a1', publicKey: 'PUBKEY' })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('combobox', { name: 'Agent' }))
    await user.click(screen.getByText('Deploy Bot'))
    await user.click(screen.getByRole('button', { name: /^grant access$/i }))

    await waitFor(() => expect(mutateMock).toHaveBeenCalled())
    expect(mutateMock.mock.calls[0][0].methods).toEqual(['exec', 'inject'])
  })

  it('keeps method selection editable for a vault containing a script', async () => {
    useMemberSyncStore.setState({
      vaults: new Map([['v1', {
        vaultId: 'v1', status: 'ready', failureKind: null, metadata: null, structure: {},
        appliedThroughSequence: '0', entries: new Map([['script', {
          state: 'active', corrupt: false, payload: { entryType: 'script' },
        }]]),
      } as never]]),
    })
    getAgent.mockResolvedValue({ agentId: 'a1', publicKey: 'PUBKEY' })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('combobox', { name: 'Agent' }))
    await user.click(screen.getByText('Deploy Bot'))
    expect(screen.getByRole('combobox', { name: /how the agent may use it/i })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /^grant access$/i }))

    await waitFor(() => expect(mutateMock).toHaveBeenCalled())
    expect(mutateMock.mock.calls[0][0].methods).toEqual(['exec', 'inject'])
  })

  it('does not enumerate or require Entry projections for a FULL grant', async () => {
    useMemberSyncStore.setState({
      vaults: new Map([['v1', {
        vaultId: 'v1', status: 'idle', failureKind: null, metadata: null, structure: {},
        appliedThroughSequence: '0', entries: new Map([['pending', {
          state: 'active', corrupt: false, payload: null,
        }]]),
      } as never]]),
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('combobox', { name: 'Agent' }))
    await user.click(screen.getByText('Deploy Bot'))

    expect(screen.getByRole('button', { name: /^grant access$/i })).toBeEnabled()
  })

  it('blocks a granular grant until its requested Entry projection exists', async () => {
    const user = userEvent.setup()
    render(
      <GrantAccessDialog
        mode={{ kind: 'agent-for-entry', vaultId: 'v1', entryId: 'missing' }}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Agent' }))
    await user.click(screen.getByText('Deploy Bot'))

    expect(screen.getByText(/wait for this vault to finish syncing/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^grant access$/i })).toBeDisabled()
  })

  it('blocks submit when no subject is chosen', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /^grant access$/i }))
    expect(screen.getByText(/choose who or what to grant/i)).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })
})
