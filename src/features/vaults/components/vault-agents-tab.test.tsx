import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VaultAgentsTab } from './vault-agents-tab'

const orgGrantsPanel = vi.hoisted(() => vi.fn(() => <div data-testid="grants-history" />))
vi.mock('../../grants', () => ({ OrgGrantsPanel: orgGrantsPanel }))

describe('VaultAgentsTab', () => {
  it('renders only the Vault-scoped grants panel', () => {
    render(<VaultAgentsTab vaultId="vault-1" />)

    expect(screen.getByTestId('grants-history')).toBeInTheDocument()
    expect(screen.queryByText(/Scoped grants/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Discovery synchronization/i)).not.toBeInTheDocument()
    expect(orgGrantsPanel).toHaveBeenCalledWith(
      expect.objectContaining({ vaultId: 'vault-1', allowRegrant: false }),
      undefined,
    )
  })
})
