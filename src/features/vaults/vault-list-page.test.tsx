import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultListPage } from './vault-list-page'

const navigate = vi.hoisted(() => vi.fn())
const vaultList = vi.hoisted(() => ({
  status: 'syncing' as 'syncing' | 'ready',
  items: [] as Array<{ id: string; isDefault: boolean; entryCount: number }>,
  allItems: [] as Array<{ id: string; isDefault: boolean; entryCount: number }>,
  retry: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../shared/hooks/use-wide-screen', () => ({ useWideScreen: () => true }))
vi.mock('../auth', () => ({
  useAuthStore: (selector: (state: { permissions: number }) => unknown) => selector({ permissions: 0 }),
}))
vi.mock('./sync/member-vault-list', () => ({ useMemberVaultList: () => vaultList }))
vi.mock('./components/vault-list-panel', () => ({ VaultListPanel: () => null }))
vi.mock('./components/create-vault-dialog', () => ({ CreateVaultDialog: () => null }))
vi.mock('./components/premium-gate-dialog', () => ({ PremiumGateDialog: () => null }))
vi.mock('./components/vault-card', () => ({ VaultCard: () => null }))

describe('VaultListPage onboarding import intent', () => {
  beforeEach(() => {
    navigate.mockClear()
    vaultList.status = 'syncing'
    vaultList.items = []
    vaultList.allItems = []
  })

  it('waits for authoritative sync and routes to the server-owned default Vault', async () => {
    const view = render(<VaultListPage initialIntent="import" />)

    expect(navigate).not.toHaveBeenCalled()

    vaultList.status = 'ready'
    vaultList.allItems = [
      { id: 'vault-team', isDefault: false, entryCount: 0 },
      { id: 'vault-personal', isDefault: true, entryCount: 0 },
    ]
    vaultList.items = vaultList.allItems
    view.rerender(<VaultListPage initialIntent="import" />)

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: '/vaults/$vaultId',
        params: { vaultId: 'vault-personal' },
        search: { import: true },
        replace: true,
      })
    })
  })
})
