import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubmissionListItem } from './api/submissions-api'

type MutateOptions = { onSuccess?: () => void }

const mocks = vi.hoisted(() => ({
  lists: { pending: [] as unknown[], trashed: [] as unknown[] },
  restoreMutate: vi.fn(),
  navigate: vi.fn(),
  approvedResult: null as unknown,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, search, ...rest }: { children: ReactNode; to: string; params?: Record<string, string>; search?: Record<string, string> }) => (
    <a data-to={to} data-params={JSON.stringify(params ?? {})} data-search={JSON.stringify(search ?? {})} {...rest}>{children}</a>
  ),
  useNavigate: () => mocks.navigate,
}))
vi.mock('../../shared/hooks/use-wide-screen', () => ({ useWideScreen: () => true }))
vi.mock('./use-submissions', () => ({
  useSubmissions: (state: 'pending' | 'trashed') => ({ data: mocks.lists[state], isPending: false, isError: false, refetch: vi.fn() }),
  useRestoreSubmission: () => ({ mutate: mocks.restoreMutate, isPending: false }),
}))
vi.mock('./components/submission-decision-panel', () => ({
  SubmissionDecisionPanel: ({ item, onApproved }: { item: SubmissionListItem; onApproved: (result: unknown) => void }) => (
    <button type="button" onClick={() => onApproved(mocks.approvedResult)}>decide {item.agentName}</button>
  ),
}))

import { SubmissionsPage } from './submissions-page'

const item = (submissionId: string, overrides: Partial<SubmissionListItem> = {}): SubmissionListItem => ({
  submissionId, agentId: 'a1', agentName: 'Deploy Bot', submissionKind: 2, entryType: 1,
  target: { kind: 'update' }, suggestedVaultId: null, state: 'pending', agentUseSuspended: false,
  createdAt: new Date().toISOString(), approverKeyVersion: 1, ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lists = { pending: [item('s1'), item('s2', { agentName: 'CI Runner', submissionKind: 1, entryType: 0 })], trashed: [] }
})

describe('SubmissionsPage', () => {
  it('lists pending submissions with value-free summaries and a pending count', () => {
    render(<SubmissionsPage view="pending" />)
    expect(screen.getByText('Password update · Credential')).toBeInTheDocument()
    expect(screen.getByText('New entry · Key')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Select a submission to review it')).toBeInTheDocument()
  })

  it('opens the decision view for the routed submission and offers the approved entry afterwards', () => {
    mocks.approvedResult = { submissionId: 's1', vaultId: 'v1', entryId: 'e1', entryRevision: '8', grantId: null }
    render(<SubmissionsPage view="pending" submissionId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: 'decide Deploy Bot' }))
    expect(screen.getByText('Saved to the vault')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open entry' }))
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/vaults/$vaultId/entries/$entryId', params: { vaultId: 'v1', entryId: 'e1' } })
  })

  it('reports a submission that was already decided elsewhere', () => {
    render(<SubmissionsPage view="pending" submissionId="gone" />)
    expect(screen.getByText('This submission was already handled or is no longer available')).toBeInTheDocument()
  })

  it('restores a trashed submission and explains retention', () => {
    mocks.lists.trashed = [item('t1', { state: 'trashed', agentUseSuspended: true })]
    render(<SubmissionsPage view="trashed" submissionId="t1" />)
    expect(screen.getByRole('tab', { name: 'Trash' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/stay in the trash for 30 days/)).toBeInTheDocument()
    expect(screen.getByText(/cannot use a restored submission until it is approved/)).toBeInTheDocument()
    mocks.restoreMutate.mockImplementation((_id: string, options: MutateOptions) => options.onSuccess?.())
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(mocks.restoreMutate).toHaveBeenCalledWith('t1', expect.any(Object))
    expect(screen.queryByRole('button', { name: /decide/ })).not.toBeInTheDocument()
  })

  it('shows empty states for both views', () => {
    mocks.lists.pending = []
    const { unmount } = render(<SubmissionsPage view="pending" />)
    expect(screen.getByText('No submissions waiting for review')).toBeInTheDocument()
    unmount()
    render(<SubmissionsPage view="trashed" />)
    expect(screen.getByText('Trash is empty')).toBeInTheDocument()
  })
})
