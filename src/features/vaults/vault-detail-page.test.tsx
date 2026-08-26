import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultDetailPage } from './vault-detail-page'

const layout = vi.hoisted(() => ({ isWide: true }))
const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('../../shared/hooks/use-wide-screen', () => ({
  useWideScreen: () => layout.isWide,
}))
vi.mock('./use-vault', () => ({
  useVault: () => ({
    data: {
      id: 'vault-1',
      organizationId: 'org-1',
      name: 'Personal',
      description: null,
      icon: null,
      color: null,
      grantMode: 2,
      createdAt: '2026-08-22T12:00:00Z',
      updatedAt: '2026-08-22T12:00:00Z',
      entryCount: 0,
      activeGrantCount: 0,
      memberCount: 1,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock('./components/vault-detail-header', () => ({
  VaultDetailHeader: ({ actions }: { actions: React.ReactNode }) => <div>{actions}</div>,
}))
vi.mock('./components/vault-detail-tabs', () => ({
  VaultDetailTabs: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}))
vi.mock('./components/vault-list-panel', () => ({ VaultListPanel: () => null }))
vi.mock('./components/vault-entries-tab', () => ({ VaultEntriesTab: () => null }))
vi.mock('./components/vault-agents-tab', () => ({ VaultAgentsTab: () => null }))
vi.mock('./components/vault-detail-audit-log', () => ({ VaultDetailAuditLog: () => null }))
vi.mock('./components/vault-members-tab', () => ({ VaultMembersTab: () => null }))
vi.mock('./components/vault-settings-form', () => ({ VaultSettingsForm: () => null }))
vi.mock('./components/create-entry-modal', () => ({ CreateEntryModal: () => null }))
vi.mock('./components/export-dialog', () => ({ ExportDialog: () => null }))
vi.mock('../grants', () => ({ GrantAccessDialog: () => null }))
vi.mock('./components/import-wizard-modal', () => ({
  ImportWizardModal: () => {
    const [started, setStarted] = useState(false)
    return (
      <button type="button" onClick={() => setStarted(true)}>
        {started ? 'Import progress retained' : 'Start tracked import'}
      </button>
    )
  },
}))

describe('VaultDetailPage', () => {
  beforeEach(() => {
    navigate.mockClear()
  })

  it('opens Import once and consumes the onboarding query intent', async () => {
    render(<VaultDetailPage vaultId="vault-1" initialImport />)

    expect(await screen.findByRole('button', { name: 'Start tracked import' })).toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith({
      to: '/vaults/$vaultId',
      params: { vaultId: 'vault-1' },
      search: {},
      replace: true,
    })
  })

  it('keeps the active import mounted when the responsive layout changes', async () => {
    layout.isWide = true
    const view = render(<VaultDetailPage vaultId="vault-1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Start tracked import' }))
    expect(screen.getByRole('button', { name: 'Import progress retained' })).toBeInTheDocument()

    layout.isWide = false
    view.rerender(<VaultDetailPage vaultId="vault-1" />)

    expect(screen.getByRole('button', { name: 'Import progress retained' })).toBeInTheDocument()
  })
})
