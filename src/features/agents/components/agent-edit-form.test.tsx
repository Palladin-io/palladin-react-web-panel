import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_STATUS_ACTIVE,
  type Agent,
} from '../api/agents-api'
import { AgentEditForm } from './agent-edit-form'

// Mutation + icon-upload hooks are driven from the test so we can flip the
// success / error paths.
const updateMutateMock = vi.fn()
let updateIsPending = false

vi.mock('../use-update-agent', () => ({
  useUpdateAgent: () => ({
    mutate: updateMutateMock,
    get isPending() {
      return updateIsPending
    },
  }),
}))

const uploadMock = vi.fn()
let iconUploadError: string | null = null
vi.mock('../use-agent-icon-upload', () => ({
  useAgentIconUpload: () => ({
    upload: uploadMock,
    isUploading: false,
    get error() {
      return iconUploadError
    },
  }),
}))

vi.mock('../use-agent-types', () => ({
  useAgentTypes: () => ({ data: ['claudeCode', 'cursor', 'other'] }),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}))

// The icon picker renders its own deep tree (modal, file input); stub it so the
// test stays focused on the name / type / description editing + submit flow.
vi.mock('./agent-icon-picker', () => ({
  AgentIconPicker: () => <div data-testid="agent-icon-picker" />,
  DEFAULT_AGENT_COLOR: '#16A34A',
}))

const baseAgent: Agent = {
  agentId: 'agent-1',
  name: 'Deploy Bot',
  status: AGENT_STATUS_ACTIVE,
  type: null,
  iconKey: null,
  iconColor: null,
  publicKeyPrefix: 'pk7Yq2Lm',
  publicKeySuffix: 'aB3x',
  createdAt: '2026-05-17T10:00:00Z',
  enrolledAt: '2026-05-17T11:00:00Z',
  enrolledByName: 'Alice',
  deactivatedAt: null,
  deactivatedByName: null,
  reactivatedAt: null,
  reactivatedByName: null,
  description: 'CI deployment agent',
  lastIp: null,
  lastHostname: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('AgentEditForm', () => {
  beforeEach(() => {
    updateMutateMock.mockReset()
    uploadMock.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    updateIsPending = false
    iconUploadError = null
  })

  it('renders the existing agent name and description', () => {
    render(<AgentEditForm agent={baseAgent} canEdit />, { wrapper })
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Deploy Bot')
    expect(screen.getByLabelText(/description/i)).toHaveValue('CI deployment agent')
  })

  it('hides the Save button when canEdit is false', () => {
    render(<AgentEditForm agent={baseAgent} canEdit={false} />, { wrapper })
    expect(
      screen.queryByRole('button', { name: /save changes/i }),
    ).not.toBeInTheDocument()
  })

  it('submits the changed name and shows a success toast', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((_vars, options) => options.onSuccess())

    render(<AgentEditForm agent={baseAgent} canEdit />, { wrapper })

    const nameInput = screen.getByLabelText(/display name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed Bot')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock).toHaveBeenCalledTimes(1)
    expect(updateMutateMock.mock.calls[0][0]).toEqual({
      agentId: 'agent-1',
      input: { name: 'Renamed Bot', description: 'CI deployment agent' },
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('shows an error toast when the update mutation fails', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((_vars, options) => options.onError())

    render(<AgentEditForm agent={baseAgent} canEdit />, { wrapper })

    const nameInput = screen.getByLabelText(/display name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Whatever')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/could not save the agent/i),
    )
  })
})
