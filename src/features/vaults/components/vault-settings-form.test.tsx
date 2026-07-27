import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GRANT_MODE_GRANULAR, type Vault } from '../types'
import { VaultMetadataConflictError } from '../vault-settings-service'
import { VaultSettingsForm } from './vault-settings-form'

// Mutations driven from the test so we can flip success/error paths.
const updateMutateMock = vi.fn()
const deleteMutateMock = vi.fn()
let updateIsPending = false
const deleteIsPending = false

vi.mock('../use-update-vault', () => ({
  useUpdateVault: () => ({
    mutate: updateMutateMock,
    get isPending() {
      return updateIsPending
    },
  }),
}))

vi.mock('../use-delete-vault', () => ({
  useDeleteVault: () => ({
    mutate: deleteMutateMock,
    get isPending() {
      return deleteIsPending
    },
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

// Pickers render irrelevant DOM here; stub them so we keep the test
// focused on the form's name/description editing + submit behaviour.
vi.mock('./vault-icon-picker', () => ({
  VaultIconPicker: ({ onFileSelected }: { onFileSelected: (file: File, url: string) => void }) => (
    <button type="button" onClick={() => onFileSelected(new File(['png'], 'icon.png', { type: 'image/png' }), 'blob:preview')}>
      Upload test icon
    </button>
  ),
}))

const baseVault: Vault = {
  id: 'v1',
  organizationId: 'org-1',
  name: 'Production Keys',
  description: 'Critical production secrets',
  icon: 'shield',
  color: '#EB4747',
  grantMode: GRANT_MODE_GRANULAR,
  createdAt: '2026-04-25T10:00:00Z',
  updatedAt: '2026-04-25T10:00:00Z',
  entryCount: 8,
  activeGrantCount: 3,
  memberCount: 1,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('VaultSettingsForm', () => {
  beforeEach(() => {
    updateMutateMock.mockReset()
    deleteMutateMock.mockReset()
    toastError.mockReset()
    updateIsPending = false
  })

  it('renders the existing vault name and description', () => {
    render(<VaultSettingsForm vault={baseVault} />, { wrapper })
    expect(screen.getByLabelText(/vault name/i)).toHaveValue('Production Keys')
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'Critical production secrets',
    )
  })

  it('keeps Save Changes enabled but a no-op submit short-circuits to onSaved', async () => {
    // The Save button is not disabled while idle — submitting without
    // edits yields an empty patch, which the form treats as a no-op
    // and forwards straight to onSaved without hitting the mutation.
    const user = userEvent.setup()
    const onSaved = vi.fn()

    render(<VaultSettingsForm vault={baseVault} onSaved={onSaved} />, { wrapper })
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('submits the changed name and calls onSaved on success', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()

    updateMutateMock.mockImplementation((input, options) => {
      options.onSuccess(input.nextMetadata)
    })

    render(<VaultSettingsForm vault={baseVault} onSaved={onSaved} />, { wrapper })

    const nameInput = screen.getByLabelText(/vault name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed Vault')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock).toHaveBeenCalledTimes(1)
    const input = updateMutateMock.mock.calls[0][0]
    expect(input).toEqual({
      expectedMetadata: {
        name: 'Production Keys',
        description: 'Critical production secrets',
        iconReference: 'shield',
        color: '#EB4747',
      },
      nextMetadata: {
        name: 'Renamed Vault',
        description: 'Critical production secrets',
        iconReference: 'shield',
        color: '#EB4747',
      },
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('shows an error toast when the update mutation fails', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((_patch, options) => {
      options.onError(new Error('500'))
    })

    render(<VaultSettingsForm vault={baseVault} />, { wrapper })

    const nameInput = screen.getByLabelText(/vault name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Whatever')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/could not save changes/i))
  })

  it('passes the selected file into the encrypted settings transaction', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((input, options) => options.onSuccess({
      ...input.nextMetadata,
      iconReference: 'asset:22222233-4455-4677-8899-aabbccddeeff',
    }))
    render(<VaultSettingsForm vault={baseVault} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Upload test icon' }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock.mock.calls[0][0].iconFile).toBeInstanceOf(File)
  })

  it('shows an explicit refresh message for a concurrent metadata conflict', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((_input, options) => options.onError(new VaultMetadataConflictError()))
    render(<VaultSettingsForm vault={baseVault} />, { wrapper })
    await user.clear(screen.getByLabelText(/vault name/i))
    await user.type(screen.getByLabelText(/vault name/i), 'Conflict')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/changed on another device/i))
  })
})
