import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentDiscoveryProvisioning } from '../use-agent-discovery-provisioning'
import { VaultAgentsTab } from './vault-agents-tab'

const orgGrantsPanel = vi.hoisted(() => vi.fn(() => <div data-testid="grants-history" />))

vi.mock('../use-agent-discovery-provisioning', () => ({
  useAgentDiscoveryProvisioning: vi.fn(),
}))

vi.mock('../../grants', () => ({ OrgGrantsPanel: orgGrantsPanel }))

const mockDiscovery = vi.mocked(useAgentDiscoveryProvisioning)
const currentAgent = {
  agentId: '123e4567-e89b-42d3-a456-426614174000',
  agentName: 'Deploy Agent',
  recipientKeyVersion: 3,
  status: 'current' as const,
  manifestRevision: '42',
}

function discoveryReturn(overrides: Record<string, unknown> = {}) {
  return {
    canManageVault: true,
    data: [currentAgent],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAgentDiscoveryProvisioning>
}

describe('VaultAgentsTab', () => {
  beforeEach(() => {
    mockDiscovery.mockReset()
    orgGrantsPanel.mockClear()
  })

  it('separates Discovery eligibility from scoped secret grants', () => {
    mockDiscovery.mockReturnValue(discoveryReturn())
    render(<VaultAgentsTab vaultId="vault-1" />)

    expect(screen.getByText('Deploy Agent')).toBeInTheDocument()
    expect(screen.getByText('Current')).toBeInTheDocument()
    expect(screen.getByText(/does not grant access to secrets/i)).toBeInTheDocument()
    expect(screen.getByTestId('grants-history')).toBeInTheDocument()
    expect(orgGrantsPanel).toHaveBeenCalledWith(
      expect.objectContaining({ vaultId: 'vault-1', allowRegrant: false }),
      undefined,
    )
  })

  it('makes pending key state visible and shortens an opaque fallback ID', () => {
    mockDiscovery.mockReturnValue(discoveryReturn({
      data: [{ ...currentAgent, agentName: null, status: 'pending', manifestRevision: null }],
    }))
    render(<VaultAgentsTab vaultId="vault-1" />)

    expect(screen.getByText('Pending update')).toBeInTheDocument()
    expect(screen.getAllByText(/123e4567…174000/)).toHaveLength(2)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('explains how disabled Agents and expired grants remain represented', () => {
    mockDiscovery.mockReturnValue(discoveryReturn({ data: [] }))
    render(<VaultAgentsTab vaultId="vault-1" />)

    expect(screen.getByText(/Deactivated Agents are excluded/)).toBeInTheDocument()
    expect(screen.getByText(/expired or revoked grants remain visible/)).toBeInTheDocument()
  })

  it('does not fetch-render Discovery details without VaultManage', () => {
    mockDiscovery.mockReturnValue(discoveryReturn({ canManageVault: false, data: undefined }))
    render(<VaultAgentsTab vaultId="vault-1" />)

    expect(screen.getByText(/don't have permission to view Discovery/i)).toBeInTheDocument()
    expect(screen.queryByText('Deploy Agent')).not.toBeInTheDocument()
  })
})
