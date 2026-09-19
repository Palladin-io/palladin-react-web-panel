import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { EntryGrantFieldSelection } from './entry-grant-field-selection'

const mocks = vi.hoisted(() => ({
  privateKey: new Uint8Array(32) as Uint8Array | null,
  getVault: vi.fn(), getEntry: vi.fn(), openKey: vi.fn(), openSecret: vi.fn(), fields: vi.fn(), wipe: vi.fn(),
}))
vi.mock('../../auth', () => ({ useAuthStore: Object.assign(
  (selector: (state: { privateKey: Uint8Array | null }) => unknown) => selector(mocks),
  { getState: () => mocks },
) }))
vi.mock('../../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.openSecret }))
vi.mock('../../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: mocks.openKey }))
vi.mock('../../../shared/crypto/grant-protocol', () => ({ listGrantableFields: mocks.fields }))
vi.mock('../../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
const props = { vaultId: 'vault', entryId: 'entry', onChange: vi.fn(), disabled: false }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.privateKey = new Uint8Array(32)
  mocks.getVault.mockResolvedValue({ memberVaultKey: {} })
  mocks.getEntry.mockResolvedValue({ organizationId: 'org', currentRevision: '3', entryKey: {}, memberSecret: {} })
  mocks.openKey.mockResolvedValue(new Uint8Array(32))
  mocks.openSecret.mockResolvedValue({})
  mocks.fields.mockReturnValue([{ id: 'credential.password', label: 'Password', access: 'onGrantValue' }])
})
it('reads field labels only after selecting a restricted scope', async () => {
  const view = render(<EntryGrantFieldSelection {...props} value={{ mode: 'all' }} />)
  expect(mocks.getEntry).not.toHaveBeenCalled()
  view.rerender(<EntryGrantFieldSelection {...props} value={{ mode: 'selected', fieldIds: [] }} />)
  await waitFor(() => expect(mocks.fields).toHaveBeenCalled())
  await userEvent.click(screen.getByRole('button', { name: 'Choose fields' }))
  expect(screen.getByRole('option', { name: 'Password' })).toBeInTheDocument()
  expect(mocks.openSecret).toHaveBeenCalledWith({}, {}, expect.any(Uint8Array), {
    organizationId: 'org', vaultId: 'vault', entryId: 'entry', revision: '3',
  })
  expect(mocks.wipe).toHaveBeenCalled()
})
it('discards field labels when unlock changes during decryption', async () => {
  let finish!: (value: object) => void
  mocks.openSecret.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  render(<EntryGrantFieldSelection {...props} value={{ mode: 'selected', fieldIds: [] }} />)
  await waitFor(() => expect(mocks.openSecret).toHaveBeenCalled())
  mocks.privateKey = null
  finish({})
  await waitFor(() => expect(mocks.wipe).toHaveBeenCalled())
  expect(mocks.fields).not.toHaveBeenCalled()
})
it('shows an unavailable state without offering fields after a failed read', async () => {
  mocks.getEntry.mockRejectedValue(new Error('offline'))
  render(<EntryGrantFieldSelection {...props} value={{ mode: 'selected', fieldIds: [] }} />)
  await waitFor(() => expect(screen.getByText(/Could not load the fields/)).toBeInTheDocument())
  expect(mocks.openSecret).not.toHaveBeenCalled()
})
