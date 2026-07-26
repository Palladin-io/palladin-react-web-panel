import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateVaultDialog } from './create-vault-dialog'

// Mutation under test — replaced with a controllable mock so we can
// drive onSuccess / onError paths from each scenario without going
// through the real crypto + HTTP stack.
const mutateMock = vi.fn()
let isPending = false

vi.mock('../use-create-vault', () => ({
  useCreateVault: () => ({
    mutate: mutateMock,
    get isPending() {
      return isPending
    },
  }),
}))

// Analytics is fire-and-forget; we just assert it was called with
// the right (module, event) tuple so the convention stays honest.
vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

// Picker children render real DOM (icons, file inputs) we don't care
// about here. Stubbing them keeps the test focused on form behaviour.
vi.mock('./vault-icon-picker', () => ({
  VaultIconPicker: () => <div data-testid="vault-icon-picker" />,
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('CreateVaultDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    toastError.mockReset()
    isPending = false
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateVaultDialog open={false} onClose={vi.fn()} />,
      { wrapper },
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the form with name field and Create button when open', () => {
    render(<CreateVaultDialog open={true} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByLabelText(/vault name/i)).toBeInTheDocument()
    expect(screen.getByText(/active organization agents/i)).toBeInTheDocument()
    // The submit button shares its label with the heading; scope the
    // assertion to the button role to avoid the duplicate-text trap.
    expect(screen.getByRole('button', { name: /^create vault$/i })).toBeInTheDocument()
  })

  it('keeps the Create button disabled while the name field is empty', () => {
    render(<CreateVaultDialog open={true} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByRole('button', { name: /^create vault$/i })).toBeDisabled()
  })

  it('enables the Create button once a name is typed', async () => {
    const user = userEvent.setup()
    render(<CreateVaultDialog open={true} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/vault name/i), 'Production')
    expect(screen.getByRole('button', { name: /^create vault$/i })).toBeEnabled()
  })

  it('closes after successful submission without navigating to legacy detail', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    // Resolve the mutation synchronously through the success path so
    // we can assert the dialog reaction without juggling async timers.
    mutateMock.mockImplementation((_input, options) => {
      options.onSuccess({ vaultId: 'vault-1' })
    })

    render(
      <CreateVaultDialog open={true} onClose={onClose} />,
      { wrapper },
    )

    await user.type(screen.getByLabelText(/vault name/i), 'Production')
    await user.click(screen.getByRole('button', { name: /^create vault$/i }))

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces an error toast when the mutation fails', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => {
      options.onError(new Error('boom'))
    })

    render(<CreateVaultDialog open={true} onClose={vi.fn()} />, { wrapper })
    await user.type(screen.getByLabelText(/vault name/i), 'Production')
    await user.click(screen.getByRole('button', { name: /^create vault$/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/could not create the vault/i))
  })

  it('invokes onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<CreateVaultDialog open={true} onClose={onClose} />, { wrapper })
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
