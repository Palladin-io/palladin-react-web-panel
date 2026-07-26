import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  type Vault,
} from '../types'
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

// The Script refs editor loads the vault's entries for its source picker.
vi.mock('../use-entries', async (orig) => ({
  ...(await orig<typeof import('../use-entries')>()),
  useAllEntries: () => ({ data: [] }),
}))

// CodeMirror needs layout APIs jsdom lacks — stub it with a plain textarea.
vi.mock('./script-editor', () => ({
  ScriptEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
  }) => (
    <textarea
      aria-label="script editor"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }))

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
    toastError.mockReset()
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
      String(ENTRY_TYPE_CREDENTIAL),
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
    expect(input.label).toBe('Stripe Key')
    expect(input.agentLabel).toBe('Stripe Key')
    expect(input.type).toBe(ENTRY_TYPE_KEY)
    expect(input.payload).toEqual({ type: ENTRY_TYPE_KEY, value: 'sk_live_123' })
    expect(input.policy.fields.value).toBe('onGrantValue')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submits Credential plaintext only to the local projection builder', async () => {
    const user = userEvent.setup()

    mutateMock.mockImplementation((_input, options) => {
      options.onSuccess({ id: 'entry-2' })
    })

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(
      screen.getByLabelText(/entry type/i),
      String(ENTRY_TYPE_CREDENTIAL),
    )
    await user.type(screen.getByLabelText(/^label$/i), 'GitHub')
    await user.type(screen.getByLabelText(/^username$/i), '  user@example.com ')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.type(screen.getByLabelText(/^url$/i), 'https://github.com/path')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [input] = mutateMock.mock.calls[0]
    expect(input.type).toBe(ENTRY_TYPE_CREDENTIAL)
    expect(input.policy.fields.username).toBe('discovery')
    expect(input.policy.fields.urlDomain).toBe('discovery')
    expect(input.policy.fields.password).toBe('onGrantValue')
    expect(input.payload).toEqual({
      type: ENTRY_TYPE_CREDENTIAL,
      username: 'user@example.com',
      password: 'secret',
      url: 'https://github.com/path',
      notes: undefined,
    })
  })

  it('folds a custom field into the encrypted payload (v2)', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'e-3' }))

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/^label$/i), 'API')
    await user.type(screen.getByLabelText(/^value$/i), 'sk_live')
    // "+ Add field" opens a type menu; pick Text.
    await user.click(screen.getByRole('button', { name: /add field/i }))
    await user.click(screen.getByRole('menuitem', { name: /^text/i }))
    await user.type(screen.getByPlaceholderText(/recovery email/i), '  Recovery email  ')
    await user.type(screen.getByPlaceholderText(/^field value$/i), '  backup@example.com ')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    const [input] = mutateMock.mock.calls[0]
    expect(input.payload.v).toBe(2)
    expect(input.payload.fields).toEqual([
      { id: expect.any(String), label: 'Recovery email', type: 'text', value: 'backup@example.com' },
    ])
  })

  it('submits a SCRIPT entry with a trimmed body and interpreter', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'e-4' }))

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_SCRIPT))
    await user.type(screen.getByLabelText(/^label$/i), 'Deploy')
    await user.type(screen.getByLabelText(/script editor/i), '  echo hi  ')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    // URL is hidden for scripts.
    expect(screen.queryByLabelText(/^url$/i)).not.toBeInTheDocument()

    const [input] = mutateMock.mock.calls[0]
    expect(input.type).toBe(ENTRY_TYPE_SCRIPT)
    expect(input.payload).toMatchObject({
      v: 2,
      type: ENTRY_TYPE_SCRIPT,
      script: 'echo hi',
      interpreter: 'bash',
    })
  })

  it('adds a dedicated 2FA (TOTP) field to a credential', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'e-5' }))

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_CREDENTIAL))
    await user.type(screen.getByLabelText(/^label$/i), 'GitHub')
    await user.type(screen.getByLabelText(/^username$/i), 'octocat')
    await user.type(screen.getByLabelText(/^password$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /add 2fa/i }))
    await user.type(screen.getByLabelText(/otpauth/i), 'JBSWY3DPEHPK3PXP')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    const [input] = mutateMock.mock.calls[0]
    expect(input.payload.v).toBe(2)
    expect(input.payload.fields).toHaveLength(1)
    expect(input.payload.fields[0]).toMatchObject({
      label: '2FA',
      type: 'totp',
      value: { secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30 },
    })
  })

  it('shows an error toast when the mutation fails', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => {
      options.onError(new Error('boom'))
    })

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/^label$/i), 'API')
    await user.type(screen.getByLabelText(/^value$/i), 'sk')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/could not save the entry/i))
  })

  it('lets the Member disable Discovery while retaining post-grant defaults', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'entry-private' }))
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/^label$/i), 'API')
    await user.type(screen.getByLabelText(/^value$/i), 'sk')
    await user.selectOptions(screen.getByLabelText(/entry discovery/i), 'disabled')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    const [input] = mutateMock.mock.calls[0]
    expect(input.policy.discoverable).toBe(false)
    expect(input.policy.fields.agentLabel).toBe('never')
    expect(input.policy.fields.value).toBe('onGrantValue')
  })
})
