import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Organization } from '../api/org-api'
import { OrgSettingsForm } from './org-settings-form'

// Mutation driven from the test so we can flip success/error paths.
const updateMutateMock = vi.fn()
let updateIsPending = false

vi.mock('../use-update-org', () => ({
  useUpdateOrg: () => ({
    mutate: updateMutateMock,
    get isPending() {
      return updateIsPending
    },
  }),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))

const baseOrg: Organization = {
  orgId: 'org-1',
  name: 'Acme Inc.',
  planType: 'Free',
  memberCount: 3,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('OrgSettingsForm', () => {
  beforeEach(() => {
    updateMutateMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    updateIsPending = false
  })

  it('renders the current organization name', () => {
    render(<OrgSettingsForm org={baseOrg} canEdit />, { wrapper })
    expect(screen.getByLabelText(/organization name/i)).toHaveValue('Acme Inc.')
  })

  it('submits the changed name and shows a success toast', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((_input, options) => {
      options.onSuccess()
    })

    render(<OrgSettingsForm org={baseOrg} canEdit />, { wrapper })

    const input = screen.getByLabelText(/organization name/i)
    await user.clear(input)
    await user.type(input, 'Renamed Org')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(updateMutateMock).toHaveBeenCalledTimes(1)
    expect(updateMutateMock.mock.calls[0][0]).toEqual({ name: 'Renamed Org' })
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/organization name saved/i))
  })

  it('does not call the mutation when the name is unchanged', async () => {
    const user = userEvent.setup()
    render(<OrgSettingsForm org={baseOrg} canEdit />, { wrapper })

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(updateMutateMock).not.toHaveBeenCalled()
  })

  it('shows an error toast when the update mutation fails', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((_input, options) => {
      options.onError(new Error('403'))
    })

    render(<OrgSettingsForm org={baseOrg} canEdit />, { wrapper })

    const input = screen.getByLabelText(/organization name/i)
    await user.clear(input)
    await user.type(input, 'Whatever')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/could not save the organization name/i))
  })
})
