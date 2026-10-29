import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HTTPError } from 'ky'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentSubmissionCryptoError } from '../../../shared/crypto/agent-submission'
import { analytics } from '../../../shared/lib/analytics'
import { PERMISSION_GRANT_MANAGE, PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import { useAuthStore } from '../../auth'
import { useMemberSyncStore, type DecryptedMemberVault, type MemberIndexRecord } from '../../vaults/sync/member-sync-store'
import type { SubmissionListItem } from '../api/submissions-api'
import { StaleSubmissionTargetError } from '../submission-approval'

const SECRET = 'synthetic-Fixture-Only-9!q'
const AGENT = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'
const VAULT = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e'
const OTHER_VAULT = '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e'
const BROKEN_VAULT = '2e2e2e2e-2e2e-4e2e-8e2e-2e2e2e2e2e2e'
const ENTRY = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'

type MutateOptions = { onSuccess?: (result: unknown) => void; onError?: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  keyPresentation: 'ready' as string,
  review: {} as Record<string, unknown>,
  coverage: 'none' as string,
  approveMutate: vi.fn(),
  denyMutate: vi.fn(),
  rebootstrapMutate: vi.fn(),
  getAgent: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../use-approver-keys', () => ({
  useApproverKeyPresentation: () => mocks.keyPresentation,
  useRebootstrapApproverKeys: () => ({ mutate: mocks.rebootstrapMutate, isPending: false }),
}))
vi.mock('../use-submissions', () => ({
  SUBMISSIONS_QUERY_KEY: ['submissions'],
  useSubmissionReview: () => mocks.review,
  useApproveSubmission: () => ({ mutate: mocks.approveMutate, isPending: false }),
  useDenySubmission: () => ({ mutate: mocks.denyMutate, isPending: false }),
  useExistingAgentAccess: () => ({ data: mocks.coverage, isPending: false, refetch: vi.fn() }),
}))
vi.mock('../../agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../agents')>()),
  getAgent: mocks.getAgent,
}))

import { SubmissionDecisionPanel } from './submission-decision-panel'

function entry(entryId: string, label: string, username: string, urlDomain: string): MemberIndexRecord {
  return {
    entryId, state: 'active', updatedAt: '2026-10-29T08:00:00Z', currentRevision: '7', memberIndexRevision: '7',
    currentKeyVersion: 1, corrupt: false,
    payload: {
      schema: 'palladin.member-index.v1', entryType: 'credential', memberLabel: label, description: null,
      icon: null, color: null, username, urlDomain, customIndex: [],
    },
  }
}

function vault(vaultId: string, name: string, entries: MemberIndexRecord[] = [], status: DecryptedMemberVault['status'] = 'ready'): DecryptedMemberVault {
  return {
    vaultId,
    metadata: { schema: 'palladin.member-vault-metadata.v1', name, description: null, icon: null, color: null } as DecryptedMemberVault['metadata'],
    structure: { isDefault: false, createdAt: '', updatedAt: '', memberCount: 1, entryCount: entries.length, activeGrantCount: 0 },
    entries: new Map(entries.map((record) => [record.entryId, record])),
    appliedThroughSequence: '1',
    status,
    failureKind: status === 'error' ? 'sync' : null,
  }
}

const listItem = (kind: 'new' | 'update'): SubmissionListItem => ({
  submissionId: '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d', agentId: AGENT, agentName: 'Deploy Bot',
  submissionKind: kind === 'new' ? 1 : 2, entryType: 1,
  target: kind === 'new' ? { kind: 'new', suggestedVaultId: OTHER_VAULT } : { kind: 'update', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7' },
  suggestedVaultId: kind === 'new' ? OTHER_VAULT : null, state: 'pending', agentUseSuspended: false,
  createdAt: '2026-10-29T08:00:00Z', approverKeyVersion: 1,
})

function opened(kind: 'new' | 'update') {
  const target = listItem(kind).target
  return {
    submission: { target, entryType: 1 },
    payload: {
      schema: 'palladin.agent-submission-payload.v1',
      identity: { submissionKind: kind === 'new' ? 1 : 2, entryType: 1, target },
      ...(kind === 'new' ? { label: 'Example account' } : {}),
      content: kind === 'new'
        ? { username: 'synthetic-user@example.invalid', password: SECRET, url: 'https://example.invalid/login' }
        : { password: SECRET },
    },
  }
}

function renderPanel(kind: 'new' | 'update', onApproved = vi.fn()) {
  mocks.review = { isPending: false, isError: false, data: opened(kind), refetch: vi.fn() }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  render(<SubmissionDecisionPanel item={listItem(kind)} onApproved={onApproved} />, { wrapper })
  return onApproved
}

const apiError = (status: number, code: string) => new HTTPError(
  new Response(JSON.stringify({ code }), { status }), new Request('http://localhost/api/submissions/x/approve-new'), {} as never)

async function clickApproveWhenReady() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
}

const consoleSpies: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keyPresentation = 'ready'
  mocks.coverage = 'none'
  mocks.getAgent.mockResolvedValue({ agentId: AGENT, status: 'active', publicKey: 'agent-x25519', recipientKeyVersion: 3, iconKey: null })
  useAuthStore.setState({ permissions: PERMISSION_GRANT_MANAGE | PERMISSION_VAULT_MANAGE })
  useMemberSyncStore.setState({
    vaults: new Map([
      [VAULT, vault(VAULT, 'Personal', [entry(ENTRY, 'Example login', 'synthetic-user@example.invalid', 'example.invalid')])],
      [OTHER_VAULT, vault(OTHER_VAULT, 'Team')],
      [BROKEN_VAULT, vault(BROKEN_VAULT, 'Broken', [], 'error')],
    ]),
  })
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) consoleSpies.push(vi.spyOn(console, method))
  consoleSpies.push(vi.spyOn(analytics, 'capture'))
})

afterEach(() => {
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET)
    spy.mockRestore()
  }
  consoleSpies.length = 0
})

describe('SubmissionDecisionPanel — new entry', () => {
  it('shows the proposal with the secret masked until revealed', () => {
    renderPanel('new')
    expect(screen.getByRole('heading', { name: 'Deploy Bot' })).toBeInTheDocument()
    expect(screen.getByText('Proposal').nextSibling).toHaveTextContent('New entry')
    expect(screen.getByText('Type').nextSibling).toHaveTextContent('Credential')
    expect(screen.getByLabelText('Label')).toHaveValue('Example account')
    const password = screen.getByLabelText('Password')
    expect(password).toHaveClass('secret-mask')
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(password).not.toHaveClass('secret-mask')
    expect(screen.queryByText(/Password probably already changed/i)).not.toBeInTheDocument()
  })

  it('offers only synchronized vaults, preselects the suggestion and hints a local duplicate', () => {
    renderPanel('new')
    const select = screen.getByLabelText('Vault')
    expect(select).toHaveValue(OTHER_VAULT)
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Personal', 'Team'])
    expect(screen.getByText('A similar entry already exists: Example login in Personal.')).toBeInTheDocument()
  })

  it('selects the suggested vault once Vaults synchronize after a deep-link unlock, without overriding a choice', async () => {
    const synced = useMemberSyncStore.getState().vaults
    useMemberSyncStore.setState({ vaults: new Map() })
    renderPanel('new')
    expect(screen.getByLabelText('Vault').querySelectorAll('option')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    act(() => useMemberSyncStore.setState({ vaults: synced }))
    expect(screen.getByLabelText('Vault')).toHaveValue(OTHER_VAULT)
    await clickApproveWhenReady()
    expect(mocks.approveMutate.mock.calls[0][0]).toMatchObject({ kind: 'new', vaultId: OTHER_VAULT })
    fireEvent.change(screen.getByLabelText('Vault'), { target: { value: VAULT } })
    act(() => useMemberSyncStore.setState({ vaults: new Map(synced) }))
    expect(screen.getByLabelText('Vault')).toHaveValue(VAULT)
  })

  it('approves into the chosen vault with the edited label and default agent access', async () => {
    const onApproved = renderPanel('new')
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Give the agent access' })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '  Reviewed account ' } })
    fireEvent.change(screen.getByLabelText('Vault'), { target: { value: VAULT } })
    mocks.approveMutate.mockImplementation((_input: unknown, options: MutateOptions) => options.onSuccess?.({ vaultId: VAULT, entryId: 'new' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.approveMutate.mock.calls[0][0]).toMatchObject({
      kind: 'new', vaultId: VAULT, label: 'Reviewed account',
      agent: { agentId: AGENT, publicKey: 'agent-x25519', recipientKeyVersion: 3 },
    })
    expect(onApproved).toHaveBeenCalledWith({ vaultId: VAULT, entryId: 'new' })
  })

  it('approves without a grant when the approver turns agent access off', async () => {
    renderPanel('new')
    const toggle = await screen.findByRole('switch', { name: 'Give the agent access' })
    await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.approveMutate.mock.calls[0][0].agent).toBeUndefined()
  })

  it('shows existing FULL access instead of creating another grant', async () => {
    mocks.coverage = 'full'
    renderPanel('new')
    expect(screen.getByText('Deploy Bot already has full access to this vault. Approving does not change it.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    await waitFor(() => expect(mocks.getAgent).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.approveMutate.mock.calls[0][0].agent).toBeUndefined()
  })

  it('cannot grant access to an inactive agent', async () => {
    mocks.getAgent.mockResolvedValue({ agentId: AGENT, status: 'deactivated', publicKey: 'k', recipientKeyVersion: 3 })
    renderPanel('new')
    expect(await screen.findByText('The agent is not active, so it cannot receive access.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Give the agent access' })).toBeDisabled()
  })

  it('reports a missing label on blur and blocks approval', () => {
    renderPanel('new')
    const label = screen.getByLabelText('Label')
    fireEvent.change(label, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    fireEvent.blur(label)
    expect(screen.getByText('Enter a label for the entry.')).toBeInTheDocument()
  })

  it('keeps Approve disabled while the agent lookup for default access is still loading', async () => {
    mocks.getAgent.mockReturnValue(new Promise(() => undefined))
    renderPanel('new')
    await waitFor(() => expect(mocks.getAgent).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.approveMutate).not.toHaveBeenCalled()
  })

  it('shows a retryable agent lookup failure instead of approving without the default grant', async () => {
    mocks.getAgent.mockRejectedValueOnce(new Error('network')).mockResolvedValue(
      { agentId: AGENT, status: 'active', publicKey: 'agent-x25519', recipientKeyVersion: 3, iconKey: null })
    renderPanel('new')
    expect(await screen.findByText('Could not load the agent, so its access cannot be prepared.')).toBeInTheDocument()
    expect(screen.queryByText('The agent is not active, so it cannot receive access.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.approveMutate.mock.calls[0][0].agent).toEqual({ agentId: AGENT, publicKey: 'agent-x25519', recipientKeyVersion: 3 })
  })

  it('requires vault management permission', () => {
    useAuthStore.setState({ permissions: PERMISSION_GRANT_MANAGE })
    renderPanel('new')
    expect(screen.getByText('You need vault management permission to approve submissions.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('moves the submission to trash on deny', () => {
    renderPanel('new')
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(mocks.denyMutate).toHaveBeenCalledWith(listItem('new').submissionId, expect.any(Object))
  })
})

describe('SubmissionDecisionPanel — password update', () => {
  it('warns that the site password was probably already changed and names the target', () => {
    renderPanel('update')
    expect(screen.getByRole('alert')).toHaveTextContent(/Password probably already changed/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/locked out of the account/)
    expect(screen.getByText('Updates').nextSibling).toHaveTextContent('Example login · Personal')
    expect(screen.getByLabelText('New password')).toHaveClass('secret-mask')
    expect(screen.queryByLabelText('Vault')).not.toBeInTheDocument()
  })

  it('approves against the signed expected revision without renaming an unchanged label', async () => {
    renderPanel('update')
    await waitFor(() => expect(mocks.getAgent).toHaveBeenCalled())
    await clickApproveWhenReady()
    const input = mocks.approveMutate.mock.calls[0][0]
    expect(input).toMatchObject({ kind: 'update', vaultId: VAULT, entryId: ENTRY, expectedEntryRevision: '7' })
    expect(input).not.toHaveProperty('label')
  })

  it('keeps the existing entry grant notice instead of adding a second grant', () => {
    mocks.coverage = 'entry'
    renderPanel('update')
    expect(screen.getByText(/already has access to this entry/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('handles a stale target revision by blocking the update and offering a new entry', async () => {
    renderPanel('update')
    mocks.approveMutate.mockImplementationOnce((_input: unknown, options: MutateOptions) => options.onError?.(new StaleSubmissionTargetError()))
    await clickApproveWhenReady()
    expect(await screen.findByText('Entry changed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save as new entry' }))
    expect(screen.getByLabelText('Label')).toHaveValue('Example login')
    expect(screen.getByLabelText('Vault')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.approveMutate.mock.calls[1][0]).toMatchObject({ kind: 'new', label: 'Example login' })
  })
})

describe('SubmissionDecisionPanel — server conflicts', () => {
  it('treats a server stale-target-revision like a moved target', async () => {
    renderPanel('update')
    mocks.approveMutate.mockImplementationOnce((_input: unknown, options: MutateOptions) => options.onError?.(apiError(409, 'stale-target-revision')))
    await clickApproveWhenReady()
    expect(await screen.findByText('Entry changed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('reports a concurrent decision and keeps the view usable', async () => {
    renderPanel('new')
    mocks.approveMutate.mockImplementationOnce((_input: unknown, options: MutateOptions) => options.onError?.(apiError(409, 'submission-already-decided')))
    await clickApproveWhenReady()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This submission was decided or re-keyed elsewhere. The list was refreshed.'))
    expect(screen.queryByText('Entry changed')).not.toBeInTheDocument()
  })

  it('explains a secret that cannot be stored unchanged instead of altering it', async () => {
    renderPanel('new')
    mocks.approveMutate.mockImplementationOnce((_input: unknown, options: MutateOptions) => options.onError?.(new AgentSubmissionCryptoError('secret-not-nfc')))
    await clickApproveWhenReady()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/cannot store without changing it/)))
  })

  it('shows a generic failure for other errors', async () => {
    renderPanel('new')
    mocks.approveMutate.mockImplementationOnce((_input: unknown, options: MutateOptions) => options.onError?.(apiError(403, 'vault-access-required')))
    await clickApproveWhenReady()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not approve the submission.'))
  })
})

describe('SubmissionDecisionPanel — asserted entry type', () => {
  it('refuses an update whose type differs from the decrypted target and still allows new entry or deny', async () => {
    renderPanel('update')
    mocks.approveMutate.mockImplementationOnce((_input: unknown, options: MutateOptions) =>
      options.onError?.(new AgentSubmissionCryptoError('entry-type-mismatch')))
    await clickApproveWhenReady()
    expect(await screen.findByText('Different entry type')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(mocks.denyMutate).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save as new entry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.approveMutate.mock.calls[1][0]).toMatchObject({ kind: 'new', vaultId: VAULT })
  })
})

describe('SubmissionDecisionPanel — unavailable review', () => {
  it('shows a verification failure without plaintext and still allows deny', () => {
    mocks.review = { isPending: false, isError: true, error: new AgentSubmissionCryptoError('invalid-agent-signature'), refetch: vi.fn() }
    render(<SubmissionDecisionPanel item={listItem('new')} onApproved={vi.fn()} />)
    expect(screen.getByText(/failed verification.*invalid-agent-signature/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(mocks.denyMutate).toHaveBeenCalled()
  })

  it('shows a non-cryptographic load failure (e.g. 403 approver-not-current) without crashing', () => {
    mocks.review = { isPending: false, isError: true, error: apiError(403, 'approver-not-current'), refetch: vi.fn() }
    render(<SubmissionDecisionPanel item={listItem('new')} onApproved={vi.fn()} />)
    expect(screen.getByText('Could not open this submission.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
  })

  it('explains a missing review key and offers explicit re-bootstrap only when unavailable', () => {
    mocks.keyPresentation = 'waiting'
    const { unmount } = render(<SubmissionDecisionPanel item={listItem('new')} onApproved={vi.fn()} />)
    expect(screen.getByText(/Waiting for another reviewer/)).toBeInTheDocument()
    unmount()
    mocks.keyPresentation = 'unavailable'
    render(<SubmissionDecisionPanel item={listItem('new')} onApproved={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Agents must trust a new key/i)
    fireEvent.click(screen.getByRole('button', { name: 'Create new review key' }))
    expect(mocks.rebootstrapMutate).toHaveBeenCalled()
  })
})
