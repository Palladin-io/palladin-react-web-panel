import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  type Vault,
} from '../types'
import { CreateEntryModal } from './create-entry-modal'

const { ensureWebsiteIconsMock, ensureWebsiteIconsWithinMock } = vi.hoisted(() => ({
  ensureWebsiteIconsMock: vi.fn(),
  ensureWebsiteIconsWithinMock: vi.fn(),
}))

vi.mock('../../../shared/api/public-assets-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/api/public-assets-api')>(),
  ensureWebsiteIcons: ensureWebsiteIconsMock,
  ensureWebsiteIconsWithin: ensureWebsiteIconsWithinMock,
}))

const mutateMock = vi.fn()
const navigateMock = vi.fn()
let isPending = false

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

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
    navigateMock.mockReset()
    toastError.mockReset()
    isPending = false
    const assets = async (hostnames: string[]) => new Map(hostnames.map((hostname) => [hostname, {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'websiteIcon' as const,
      name: hostname,
      revision: 1,
      url: `https://assets.palladin.io/${hostname}.png`,
    }]))
    ensureWebsiteIconsMock.mockReset().mockImplementation(assets)
    ensureWebsiteIconsWithinMock.mockReset().mockImplementation(assets)
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateEntryModal open={false} vault={VAULT} onClose={vi.fn()} />,
      { wrapper },
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders CREDENTIAL fields by default and lists it before KEY', () => {
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByLabelText(/^label$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^value$/i)).not.toBeInTheDocument()

    const typeSelect = screen.getByLabelText(/entry type/i) as HTMLSelectElement
    expect(typeSelect.value).toBe(String(ENTRY_TYPE_CREDENTIAL))
    expect(Array.from(typeSelect.options, (option) => option.value).slice(0, 2)).toEqual([
      String(ENTRY_TYPE_CREDENTIAL),
      String(ENTRY_TYPE_KEY),
    ])
  })

  it('switches to KEY fields when the dropdown changes', async () => {
    const user = userEvent.setup()
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(
      screen.getByLabelText(/entry type/i),
      String(ENTRY_TYPE_KEY),
    )

    expect(screen.getByLabelText(/^value$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^url$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^username$/i)).not.toBeInTheDocument()
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

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_KEY))
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
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/vaults/$vaultId/entries/$entryId',
      params: { vaultId: 'vault-1', entryId: 'entry-1' },
    })
  })

  it('selects a website icon from URL for a KEY entry', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'stripe-key' }))
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_KEY))
    await user.type(screen.getByLabelText(/^label$/i), 'Stripe Key')
    await user.type(screen.getByLabelText(/^value$/i), 'sk_test')
    await user.type(screen.getByLabelText(/^url$/i), 'https://stripe.com')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      iconReference: 'public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2Fstripe.com.png',
      payload: expect.objectContaining({ url: 'https://stripe.com' }),
    }))
  })

  it('does not persist an automatically resolved icon from a previous URL', async () => {
    const user = userEvent.setup()
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_KEY))
    await user.type(screen.getByLabelText(/^label$/i), 'Changed host')
    await user.type(screen.getByLabelText(/^value$/i), 'secret-value')
    await user.type(screen.getByLabelText(/^url$/i), 'https://first.example.com')
    await waitFor(() => expect(ensureWebsiteIconsWithinMock).toHaveBeenCalledWith(['first.example.com'], 5_000))

    ensureWebsiteIconsWithinMock.mockResolvedValueOnce(new Map())
    await user.clear(screen.getByLabelText(/^url$/i))
    await user.type(screen.getByLabelText(/^url$/i), 'https://second.example.com')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock).toHaveBeenCalledTimes(1)
    expect(mutateMock.mock.calls[0][0].iconReference).not.toContain('public-asset:')
  })

  it('shows a ready website icon in the form before saving', async () => {
    const user = userEvent.setup()
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/^url$/i), 'https://stripe.com')

    await waitFor(() => {
      expect(ensureWebsiteIconsWithinMock).toHaveBeenCalledWith(['stripe.com'], 5_000)
      expect(document.querySelector('img[src="https://assets.palladin.io/stripe.com.png"]')).not.toBeNull()
    })
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
    expect(input.iconReference).toBe('public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2Fgithub.com.png')
  })

  it('includes a user-selected custom icon file in the encrypted create flow', async () => {
    const user = userEvent.setup()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:entry-icon-preview')
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'entry-with-icon' }))
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.click(screen.getByRole('button', { name: /icon/i }))
    const file = new File(['png'], 'custom.png', { type: 'image/png' })
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)
    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_KEY))
    await user.type(screen.getByLabelText(/^label$/i), 'Custom icon entry')
    await user.type(screen.getByLabelText(/^value$/i), 'secret')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock.mock.calls[0][0]).toEqual(expect.objectContaining({ iconFile: file }))
  })

  it('folds a custom field into the encrypted payload (v2)', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'e-3' }))

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_KEY))
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
    await user.type(screen.getByLabelText(/description/i), 'Returns the deployment status')
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
      execution: expect.objectContaining({
        description: 'Returns the deployment status',
        parameters: [],
        returnResultToAgent: true,
      }),
    })
  })

  it('submits a CREDIT_CARD entry with runtime-only Agent policy', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'card-1' }))

    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_CREDIT_CARD))
    expect(screen.getByLabelText(/cardholder name/i)).toHaveAttribute('maxlength', '256')
    await user.type(screen.getByLabelText(/^label$/i), 'Company card')
    await user.type(screen.getByLabelText(/cardholder name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/card number/i), '4242 4242 4242 4242')
    await user.type(screen.getByLabelText(/expiry month/i), '12')
    await user.type(screen.getByLabelText(/expiry year/i), '2030')
    await user.type(screen.getByLabelText(/billing address/i), '1 Main Street')
    expect(screen.queryByLabelText(/security code|cvv|cvc/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^pin/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add field/i }))
    await user.click(screen.getByRole('menuitem', { name: /^text/i }))
    await user.type(screen.getByPlaceholderText(/recovery email/i), 'Account ID')
    await user.type(screen.getByPlaceholderText(/^field value$/i), 'account-123')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [input] = mutateMock.mock.calls[0]
    expect(input.type).toBe(ENTRY_TYPE_CREDIT_CARD)
    expect(input.payload).toMatchObject({
      v: 2,
      type: ENTRY_TYPE_CREDIT_CARD,
      cardholderName: 'Ada Lovelace',
      cardNumber: '4242424242424242',
      expiryMonth: '12',
      expiryYear: '2030',
      billingAddress: '1 Main Street',
      fields: [expect.objectContaining({ label: 'Account ID', type: 'text', value: 'account-123' })],
    })
    expect(input.policy.fields.cardNumber).toBe('onGrantRuntime')
    expect(Object.entries(input.policy.fields)).toContainEqual([
      expect.stringMatching(/^custom:/),
      'onGrantRuntime',
    ])
    expect(input.payload).not.toHaveProperty('securityCode')
    expect(input.payload).not.toHaveProperty('pin')
    expect(input.policy.fields).not.toHaveProperty('securityCode')
    expect(input.policy.fields).not.toHaveProperty('pin')
  })

  it('clears credential URL icon state when switching to CREDIT_CARD', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'card-2' }))
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/^url$/i), 'https://credential.example')
    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_CREDIT_CARD))
    await user.type(screen.getByLabelText(/^label$/i), 'Company card')
    await user.type(screen.getByLabelText(/cardholder name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/card number/i), '4242424242424242')
    await user.type(screen.getByLabelText(/expiry month/i), '12')
    await user.type(screen.getByLabelText(/expiry year/i), '2030')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(mutateMock.mock.calls[0][0].iconReference).toBe('credit_card')
    expect(ensureWebsiteIconsWithinMock).not.toHaveBeenCalled()
  })

  it('shows field-level feedback for invalid CREDIT_CARD values after blur', async () => {
    const user = userEvent.setup()
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_CREDIT_CARD))
    await user.type(screen.getByLabelText(/^label$/i), 'Company card')
    await user.click(screen.getByLabelText(/cardholder name/i))
    await user.tab()
    await user.type(screen.getByLabelText(/card number/i), '123')
    await user.tab()
    await user.type(screen.getByLabelText(/expiry month/i), '13')
    await user.tab()
    await user.type(screen.getByLabelText(/expiry year/i), '30')
    await user.tab()

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      'This field is required',
      'Enter a 12–19 digit card number.',
      'Use a month from 01 to 12.',
      'Enter a four-digit year.',
    ])
    expect(screen.getByRole('button', { name: /save entry/i })).toBeDisabled()
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

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_KEY))
    await user.type(screen.getByLabelText(/^label$/i), 'API')
    await user.type(screen.getByLabelText(/^value$/i), 'sk')
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/could not save the entry/i))
  })

  it('lets the Member disable Discovery while retaining post-grant defaults', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'entry-private' }))
    render(<CreateEntryModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText(/entry type/i), String(ENTRY_TYPE_KEY))
    await user.type(screen.getByLabelText(/^label$/i), 'API')
    await user.type(screen.getByLabelText(/^value$/i), 'sk')
    await user.click(screen.getByRole('button', { name: /visible to agents in discovery/i }))
    await user.click(screen.getByRole('button', { name: /save entry/i }))

    const [input] = mutateMock.mock.calls[0]
    expect(input.policy.discoverable).toBe(false)
    expect(input.policy.fields.agentLabel).toBe('never')
    expect(input.policy.fields.value).toBe('onGrantValue')
  })
})
