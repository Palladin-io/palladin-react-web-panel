import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vault } from '../types'
import { CreateEntryModal } from './create-entry-modal'

const mutateMock = vi.fn()
let isPending = false

vi.mock('../use-create-entry', () => ({
  useCreateEntry: () => ({
    mutate: mutateMock,
    get isPending() {
      return isPending
    },
  }),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const VAULT: Vault = {
  id: 'vault-1',
  organizationId: 'org-1',
  name: 'Production',
  description: null,
  icon: null,
  color: null,
  grantMode: 2,
  createdAt: '2026-04-25T12:00:00Z',
  updatedAt: '2026-04-25T12:00:00Z',
  entryCount: 0,
  activeGrantCount: 0,
  memberCount: 1,
  wrappedVK: 'AAAAAAAA',
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('CreateEntryModal', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    isPending = false
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateEntryModal open={false} vault={VAULT} onClose={vi.fn()} />,
      { wrapper },
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders KEY-type fields by default', () => {
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByLabelText(/^label$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^value$/i)).toBeInTheDocument()
    // Credential-only fields must NOT render in KEY mode.
    expect(screen.queryByLabelText(/^username$/i)).not.toBeInTheDocument()
  })

  it('switches to CREDENTIAL fields when the dropdown changes', async () => {
    const user = userEvent.setup()
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(
      screen.getByLabelText(/entry type/i),
      'CREDENTIAL',
    )

    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^url$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^value$/i)).not.toBeInTheDocument()
  })

  it('submits a KEY entry with trimmed fields', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    mutateMock.mockImplementation((_input, options) => {
      options.onSuccess({ id: 'entry-1' })
    })

    render(
      <CreateEntryModal open vault={VAULT} onClose={onClose} />,
      { wrapper },
    )

    await user.type(screen.getByLabelText(/^label$/i), '  Stripe Key  ')
    await user.type(screen.getByLabelText(/^value$/i), '  sk_live_123 ')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [input] = mutateMock.mock.calls[0]
    expect(input.vaultId).toBe('vault-1')
    expect(input.wrappedVK).toBe('AAAAAAAA')
    expect(input.label).toBe('Stripe Key')
    expect(input.type).toBe('KEY')
    expect(input.payload).toEqual({ type: 'KEY', value: 'sk_live_123' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('extracts urlDomain on CREDENTIAL submit and trims fields', async () => {
    const user = userEvent.setup()

    mutateMock.mockImplementation((_input, options) => {
      options.onSuccess({ id: 'entry-2' })
    })

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), 'CREDENTIAL')
    await user.type(screen.getByLabelText(/^label$/i), 'GitHub')
    await user.type(screen.getByLabelText(/^username$/i), '  user@example.com ')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.type(screen.getByLabelText(/^url$/i), 'https://github.com/path')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [input] = mutateMock.mock.calls[0]
    expect(input.type).toBe('CREDENTIAL')
    expect(input.urlDomain).toBe('github.com')
    expect(input.payload).toEqual({
      type: 'CREDENTIAL',
      username: 'user@example.com',
      password: 'secret',
      url: 'https://github.com/path',
      notes: undefined,
    })
  })

  it('surfaces an error message when the mutation fails', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => {
      options.onError(new Error('boom'))
    })

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/^label$/i), 'API')
    await user.type(screen.getByLabelText(/^value$/i), 'sk')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(
      await screen.findByText(/could not save the entry/i),
    ).toBeInTheDocument()
  })

  it('blocks submit when the vault has no wrappedVK', async () => {
    const user = userEvent.setup()
    const vaultNoKey: Vault = { ...VAULT, wrappedVK: undefined }

    render(
      <CreateEntryModal open vault={vaultNoKey} onClose={vi.fn()} />,
      { wrapper },
    )

    await user.type(screen.getByLabelText(/^label$/i), 'API')
    await user.type(screen.getByLabelText(/^value$/i), 'sk')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock).not.toHaveBeenCalled()
    expect(
      await screen.findByText(/encryption key unavailable/i),
    ).toBeInTheDocument()
  })
})
