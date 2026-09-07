import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../shared/lib/i18n'
import { AgentPairingPage } from './agent-pairing-page'

const mocks = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  approve: vi.fn(),
  approveNew: vi.fn(),
  claim: vi.fn(),
  claimNew: vi.fn(),
  onApproved: vi.fn(),
  onClose: vi.fn(),
  onRejected: vi.fn(),
  prepareDiscovery: vi.fn(),
  reject: vi.fn(),
  reserve: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  uploadIcon: vi.fn(),
}))

vi.mock('./upload-agent-icon', async (importOriginal) => ({
  ...await importOriginal<typeof import('./upload-agent-icon')>(),
  uploadAgentIcon: mocks.uploadIcon,
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))
vi.mock('../../shared/lib/analytics', () => ({
  analytics: { capture: mocks.analyticsCapture },
}))
vi.mock('./api/agents-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/agents-api')>()
  return {
    ...actual,
    approveAgentPairing: mocks.approve,
    approveAgentPairingWithNewKey: mocks.approveNew,
    claimAgentPairing: mocks.claim,
    claimAgentPairingForNewKey: mocks.claimNew,
    rejectAgentPairing: mocks.reject,
    reserveAgentPairingDisplayName: mocks.reserve,
  }
})

function renderPairing(
  pairingId: string,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
  canReadApiKeys = true,
  canWriteApiKeys = true,
) {
  const result = render(
    <AgentPairingPage
      pairingId={pairingId}
      canReadApiKeys={canReadApiKeys}
      canWriteApiKeys={canWriteApiKeys}
      prepareDiscovery={mocks.prepareDiscovery}
      onApproved={mocks.onApproved}
      onClose={mocks.onClose}
      onRejected={mocks.onRejected}
    />,
    { wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ) },
  )
  return { ...result, queryClient }
}

describe('AgentPairingPage', () => {
  it('uses only create-key endpoints without ReadApiKey and never loads the existing-key list', async () => {
    mocks.claimNew.mockResolvedValue({
      pairingId: 'create-only', displayName: 'Friendly Fox', reservedDisplayName: null,
      type: 'custom/runtime', publicKeyHint: 'public', expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: true, apiKeys: [],
      hostname: 'pairing-workstation', ip: '192.0.2.10',
    })
    renderPairing('create-only', undefined, false)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('New API key name'), 'Automation')
    expect(mocks.claimNew).toHaveBeenCalledExactlyOnceWith('create-only')
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(screen.getByText('pairing-workstation').tagName).toBe('DD')
    expect(screen.getByText('192.0.2.10').tagName).toBe('DD')
    expect(screen.getByRole('combobox', { name: 'Logical API key' })).toHaveValue('__create__')
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Approve and activate' })
    expect(submit).toHaveAttribute('type', 'submit')
    expect(submit.form).toHaveAttribute('id', 'agent-pairing-approval')
    fireEvent.submit(submit.form!)
    await waitFor(() => expect(mocks.approveNew).toHaveBeenCalledExactlyOnceWith('create-only', {
      displayName: 'Friendly Fox', newApiKeyName: 'Automation',
    }))
    expect(mocks.approve).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.onApproved).toHaveBeenCalledWith('agent-1'))
  })

  it('explains the unavailable-key state and labels the runtime type', async () => {
    mocks.claim.mockResolvedValue({
      pairingId: 'no-key', displayName: 'Friendly Fox', reservedDisplayName: null,
      type: null, publicKeyHint: 'public', expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false, apiKeys: [],
    })
    renderPairing('no-key')
    expect(await screen.findByText(/Ask someone with API key management permission/)).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Approve and activate' })).toBeDisabled()
    expect(screen.getByText('Agent type').tagName).toBe('DT')
    expect(screen.getByText('Not declared').tagName).toBe('DD')
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.approveNew).not.toHaveBeenCalled()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-05T11:55:00Z'))
    await i18n.changeLanguage('en')
    mocks.approve.mockResolvedValue({ agentId: 'agent-1' })
    mocks.approveNew.mockResolvedValue({ agentId: 'agent-1' })
    mocks.reject.mockResolvedValue(undefined)
    mocks.reserve.mockResolvedValue(undefined)
    mocks.prepareDiscovery.mockResolvedValue(false)
    mocks.onApproved.mockResolvedValue(undefined)
    mocks.onRejected.mockResolvedValue(undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('replaces activation with actionable instructions after the approval deadline', async () => {
    mocks.claim.mockResolvedValue({
      pairingId: 'expired', displayName: 'Helper', type: null,
      publicKeyHint: 'public', expiresAt: '2026-09-05T11:54:59Z',
      canCreateApiKey: false, apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })
    renderPairing('expired')
    expect(await screen.findByText(/Pairing expired\. Run the pairing command again/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve and activate' })).not.toBeInTheDocument()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  it.each([true, false])('previews custom uploads and handles upload success=%s after activation without re-pairing', async (ok) => {
    const user = userEvent.setup()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:agent-preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mocks.uploadIcon.mockResolvedValue(ok ? { ok: true, iconReference: 'public-asset:icon' } : { ok: false, reason: 'failed' })
    mocks.claim.mockResolvedValue({
      pairingId: 'custom-icon', displayName: 'Helper', type: 'codex',
      publicKeyHint: 'MCowBQYD…Ed3k=', expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false, apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })
    const { unmount } = renderPairing('custom-icon')
    await user.click(await screen.findByRole('button', { name: 'Icon' }))
    expect(screen.getByRole('button', { name: 'Upload custom icon' })).toBeVisible()
    const oversized = new File([new Uint8Array(1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Upload custom icon', { selector: 'input' }), oversized)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Upload custom icon' })).toBeVisible()
    expect(mocks.uploadIcon).not.toHaveBeenCalled()
    const file = new File(['image'], 'avatar.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Upload custom icon', { selector: 'input' }), file)
    expect(document.querySelector('img')).toHaveAttribute('src', 'blob:agent-preview')
    expect(mocks.uploadIcon).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Approve and activate' }))
    await waitFor(() => expect(mocks.onApproved).toHaveBeenCalledWith('agent-1'))
    expect(mocks.approve).toHaveBeenCalledExactlyOnceWith('custom-icon', { displayName: 'Helper', apiKeyId: 'key-1' })
    expect(mocks.uploadIcon).toHaveBeenCalledExactlyOnceWith('agent-1', file)
    expect(mocks.approve.mock.invocationCallOrder[0]).toBeLessThan(mocks.uploadIcon.mock.invocationCallOrder[0])
    expect(mocks.prepareDiscovery).toHaveBeenCalledOnce()
    if (!ok) expect(mocks.toastError).toHaveBeenCalledWith('The Agent is active, but its custom icon could not be uploaded. Try again in Agent details.')
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:agent-preview')
  })

  it('shows runtime metadata as text and approves an edited name with an existing logical key', async () => {
    const user = userEvent.setup()
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-1',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: '<img src=x onerror=alert(1)>',
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    renderPairing('pairing-1')

    const name = await screen.findByLabelText('Display name')
    const rejectButton = screen.getByRole('button', { name: 'Reject' })
    const approveButton = screen.getByRole('button', { name: 'Approve and activate' })
    expect(rejectButton).toHaveClass('bg-transparent', 'text-[var(--cv-btn-outline-text)]')
    expect(rejectButton).not.toHaveClass('text-[var(--cv-primary)]')
    expect(approveButton).toHaveClass('bg-[var(--cv-primary)]')
    expect(name).toHaveValue('Runtime Helper')
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toHaveClass('break-words')
    expect(document.querySelector('img')).toBeNull()

    await user.clear(name)
    await user.type(name, 'Edited Helper')
    expect(screen.getByText('Edited Helper')).toBeVisible()
    const iconButton = screen.getByRole('button', { name: 'Icon' })
    await user.click(iconButton)
    await user.click(screen.getByRole('button', { name: 'smart toy' }))
    await user.click(screen.getByRole('button', { name: 'Choose', exact: true }))
    await waitFor(() => expect(iconButton).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Approve and activate' }))

    await waitFor(() => expect(mocks.reserve).toHaveBeenCalledWith('pairing-1', 'Edited Helper'))
    expect(mocks.approve).toHaveBeenCalledWith('pairing-1', {
      displayName: 'Edited Helper',
      apiKeyId: 'key-1',
      iconKey: 'smart_toy',
    })
    await waitFor(() => expect(mocks.onApproved).toHaveBeenCalledWith('agent-1'))
    expect(mocks.analyticsCapture).toHaveBeenCalledWith(
      'agents',
      'browser-pairing-approval-submitted',
    )
  })

  it('keeps approval pending and non-dismissible until discovery preparation finishes', async () => {
    const user = userEvent.setup()
    let finishDiscovery: ((value: boolean) => void) | undefined
    mocks.prepareDiscovery.mockImplementation(() => new Promise<boolean>((resolve) => {
      finishDiscovery = resolve
    }))
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-pending-discovery',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: 'codex',
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    renderPairing('pairing-pending-discovery')
    await user.click(await screen.findByRole('button', { name: 'Approve and activate' }))
    await waitFor(() => expect(mocks.prepareDiscovery).toHaveBeenCalledOnce())

    expect(screen.getByRole('button', { name: 'Activating…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(mocks.onApproved).not.toHaveBeenCalled()

    finishDiscovery?.(true)
    await waitFor(() => expect(mocks.onApproved).toHaveBeenCalledWith('agent-1'))
  })

  it('rerolls a colliding fallback invisibly and supports creating a logical key', async () => {
    const user = userEvent.setup()
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint32Array)[0] = 0
      return array
    })
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-2',
      displayName: null,
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: true,
      apiKeys: [],
    })
    mocks.reserve
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValue(undefined)

    renderPairing('pairing-2')

    expect(await screen.findByLabelText('Display name')).toHaveValue('Calm Otter')
    expect(screen.getByText('Not declared')).toBeInTheDocument()
    expect(mocks.reserve).toHaveBeenNthCalledWith(1, 'pairing-2', 'Amber Fox')
    expect(mocks.reserve).toHaveBeenNthCalledWith(2, 'pairing-2', 'Calm Otter')

    await user.type(screen.getByLabelText('New API key name'), 'Local Codex')
    await user.click(screen.getByRole('button', { name: 'Approve and activate' }))

    await waitFor(() => expect(mocks.approveNew).toHaveBeenCalledWith('pairing-2', {
      displayName: 'Calm Otter',
      newApiKeyName: 'Local Codex',
    }))
  })

  it('uses the Polish fallback dictionary for the same direct approval flow', async () => {
    await i18n.changeLanguage('pl')
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint32Array)[0] = 0
      return array
    })
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-3',
      displayName: null,
      reservedDisplayName: null,
      type: 'codex',
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automatyzacja', keyHint: 'pl_••••8Xq2' }],
    })

    renderPairing('pairing-3')

    expect(await screen.findByLabelText('Nazwa wyświetlana')).toHaveValue('Bursztynowy Lis')
    expect(screen.getByText('OpenAI Codex')).toBeInTheDocument()
  })

  it('keeps a successful mutating claim cached across window focus', async () => {
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-cached',
      displayName: 'Cached Helper',
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    renderPairing('pairing-cached')
    await screen.findByLabelText('Display name')
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()

    expect(mocks.claim).toHaveBeenCalledTimes(1)
  })

  it('retains a successful claim when reopened after the default five-minute cache lifetime', async () => {
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-reopened', displayName: 'Cached Helper', reservedDisplayName: null,
      type: null, publicKeyHint: 'MCowBQYD…Ed3k=', expiresAt: '2026-09-05T12:25:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })
    const { unmount, queryClient } = renderPairing('pairing-reopened')
    await screen.findByLabelText('Display name')

    vi.useFakeTimers()
    try {
      unmount()
      await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    } finally {
      vi.useRealTimers()
    }

    renderPairing('pairing-reopened', queryClient)
    expect(await screen.findByLabelText('Display name')).toHaveValue('Cached Helper')
    expect(mocks.claim).toHaveBeenCalledTimes(1)
  })

  it('reloads the authoritative claim when write-key capability changes', async () => {
    const claim = {
      pairingId: 'write-change', displayName: 'Helper', reservedDisplayName: null,
      type: null, publicKeyHint: 'MCowBQYD…Ed3k=', expiresAt: '2026-09-05T12:25:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    }
    mocks.claim.mockResolvedValueOnce(claim).mockResolvedValueOnce({ ...claim, canCreateApiKey: true })
    const { unmount, queryClient } = renderPairing('write-change', undefined, true, false)
    await screen.findByLabelText('Display name')
    expect(screen.queryByRole('option', { name: 'Create a new API key' })).not.toBeInTheDocument()
    unmount()

    renderPairing('write-change', queryClient, true, true)
    expect(await screen.findByRole('option', { name: 'Create a new API key' })).toBeInTheDocument()
    expect(mocks.claim).toHaveBeenCalledTimes(2)
  })

  it('falls back to accessible manual entry when friendly suggestions are exhausted', async () => {
    const user = userEvent.setup()
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint32Array)[0] = 0
      return array
    })
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-exhausted',
      displayName: null,
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })
    mocks.reserve.mockRejectedValue({ response: { status: 409 } })

    renderPairing('pairing-exhausted')

    const name = await screen.findByLabelText('Display name')
    expect(name).toHaveAccessibleDescription(/every suggested name is already in use/i)
    await user.type(name, 'Manual Sparrow')
    mocks.reserve.mockResolvedValueOnce(undefined)
    await user.click(screen.getByRole('button', { name: 'Approve and activate' }))

    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith('pairing-exhausted', {
      displayName: 'Manual Sparrow',
      apiKeyId: 'key-1',
    }))
  })

  it('shows a value-free accessible error when approval fails', async () => {
    const user = userEvent.setup()
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-4',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: 'custom/runtime',
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })
    mocks.approve.mockRejectedValue(new Error('transport-failed-with-private-details'))

    renderPairing('pairing-4')

    await user.click(await screen.findByRole('button', { name: 'Approve and activate' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      'The pairing action could not be completed. Check that the request is still valid and try again.',
    ))
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('private-details'))
  })

  it('shows an accessible required error for a blank new logical key name', async () => {
    const user = userEvent.setup()
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-key-name',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: true,
      apiKeys: [],
    })

    renderPairing('pairing-key-name')

    const keyName = await screen.findByLabelText('New API key name')
    await user.click(keyName)
    await user.tab()
    expect(keyName).toHaveAttribute('aria-invalid', 'true')
    expect(keyName).toHaveAccessibleDescription('Enter a name for the new API key.')
    expect(screen.getByRole('button', { name: 'Approve and activate' })).toBeDisabled()
  })

  it('freezes every editable approval field while activation is pending', async () => {
    const user = userEvent.setup()
    let resolveApproval: ((value: { agentId: string }) => void) | undefined
    mocks.approve.mockImplementation(() => new Promise((resolve) => {
      resolveApproval = resolve
    }))
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-pending',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: 'custom/runtime',
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    renderPairing('pairing-pending')
    await user.click(await screen.findByRole('button', { name: 'Approve and activate' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Display name')).toBeDisabled()
      expect(screen.getByLabelText('Logical API key')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    })
    resolveApproval?.({ agentId: 'agent-1' })
  })

  it('navigates before dropping the claim and tracks only the value-free reject intent', async () => {
    const user = userEvent.setup()
    let finishNavigation: (() => void) | undefined
    mocks.onRejected.mockImplementation(() => new Promise<void>((resolve) => {
      finishNavigation = resolve
    }))
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-reject',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    renderPairing('pairing-reject')
    await user.click(await screen.findByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(mocks.onRejected).toHaveBeenCalledOnce())
    expect(mocks.claim).toHaveBeenCalledOnce()
    expect(mocks.analyticsCapture).toHaveBeenCalledWith(
      'agents',
      'browser-pairing-rejection-submitted',
    )
    finishNavigation?.()
  })

  it('persists approved terminal state when the page unmounts before the response', async () => {
    const user = userEvent.setup()
    let resolveApproval: ((value: { agentId: string }) => void) | undefined
    mocks.approve.mockImplementation(() => new Promise((resolve) => {
      resolveApproval = resolve
    }))
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-unmounted-approval',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    const first = renderPairing('pairing-unmounted-approval')
    await user.click(await screen.findByRole('button', { name: 'Approve and activate' }))
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledOnce())
    first.unmount()
    resolveApproval?.({ agentId: 'agent-1' })

    await waitFor(() => expect(first.queryClient.getQueryData([
      'agent-pairing',
      'pairing-unmounted-approval',
      true,
      true,
    ])).toMatchObject({ terminalStatus: 'approved' }))
    renderPairing('pairing-unmounted-approval', first.queryClient)
    expect(await screen.findByText(/already activated the Agent/i)).toBeInTheDocument()
    expect(mocks.claim).toHaveBeenCalledOnce()
    expect(mocks.prepareDiscovery).not.toHaveBeenCalled()
  })

  it('does not navigate when unmount cancels discovery reconciliation', async () => {
    const user = userEvent.setup()
    let finishDiscovery: ((value: boolean) => void) | undefined
    mocks.prepareDiscovery.mockImplementation(() => new Promise<boolean>((resolve) => {
      finishDiscovery = resolve
    }))
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-cancelled-discovery',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    const page = renderPairing('pairing-cancelled-discovery')
    await user.click(await screen.findByRole('button', { name: 'Approve and activate' }))
    await waitFor(() => expect(mocks.prepareDiscovery).toHaveBeenCalledOnce())
    page.unmount()
    finishDiscovery?.(false)
    await Promise.resolve()

    expect(mocks.onApproved).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('persists rejected terminal state when the page unmounts before the response', async () => {
    const user = userEvent.setup()
    let finishRejection: (() => void) | undefined
    mocks.reject.mockImplementation(() => new Promise<void>((resolve) => {
      finishRejection = resolve
    }))
    mocks.claim.mockResolvedValue({
      pairingId: 'pairing-unmounted-rejection',
      displayName: 'Runtime Helper',
      reservedDisplayName: null,
      type: null,
      publicKeyHint: 'MCowBQYD…Ed3k=',
      expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false,
      apiKeys: [{ apiKeyId: 'key-1', name: 'Automation', keyHint: 'pl_••••8Xq2' }],
    })

    const first = renderPairing('pairing-unmounted-rejection')
    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(mocks.reject).toHaveBeenCalledOnce())
    first.unmount()
    finishRejection?.()

    await waitFor(() => expect(first.queryClient.getQueryData([
      'agent-pairing',
      'pairing-unmounted-rejection',
      true,
      true,
    ])).toMatchObject({ terminalStatus: 'rejected' }))
    renderPairing('pairing-unmounted-rejection', first.queryClient)
    expect(await screen.findByText(/already been rejected/i)).toBeInTheDocument()
    expect(mocks.claim).toHaveBeenCalledOnce()
  })

  it('contains keyboard focus and dismisses without rejecting or reclaiming the deep link', async () => {
    const user = userEvent.setup()
    mocks.claim.mockResolvedValue({ pairingId: 'focus', displayName: 'Helper', type: 'codex',
      reservedDisplayName: null, publicKeyHint: 'public', expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: true, apiKeys: [] })
    const view = renderPairing('focus')
    await screen.findByLabelText('Display name')
    expect(screen.getByRole('dialog', { name: 'Approve Agent' })).toHaveAttribute('aria-modal', 'true')
    await user.click(screen.getByLabelText('New API key name'))
    await user.type(screen.getByLabelText('New API key name'), 'Local automation')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Approve and activate' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(mocks.onClose).toHaveBeenCalledOnce()
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
    view.unmount()
    renderPairing('focus', view.queryClient)
    await screen.findByLabelText('Display name')
    expect(mocks.claim).toHaveBeenCalledOnce()
  })

  it('blocks duplicate actions and dismissal while approval is pending, then reports failure', async () => {
    const user = userEvent.setup()
    let fail: ((error: Error) => void) | undefined
    mocks.approve.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
    mocks.claim.mockResolvedValue({ pairingId: 'pending', displayName: 'Helper', type: 'codex',
      reservedDisplayName: null, publicKeyHint: 'public', expiresAt: '2026-09-05T12:00:00Z',
      canCreateApiKey: false, apiKeys: [{ apiKeyId: 'logical-key', name: 'Automation', keyHint: 'public' }] })
    renderPairing('pending')
    await user.click(await screen.findByRole('button', { name: 'Approve and activate' }))
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    expect(screen.getByLabelText('Display name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(mocks.onClose).not.toHaveBeenCalled()
    fail?.(new Error('private backend detail'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(i18n.t('agents.pairing.actionError')))
    expect(screen.queryByText('private backend detail')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve and activate' })).toBeEnabled()
  })

})
