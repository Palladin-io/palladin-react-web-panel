import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vault } from '../types'
import { ImportWizardModal } from './import-wizard-modal'
import { useAuthStore } from '../../auth'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'

const importMutate = vi.fn()
const repairIconsMutate = vi.hoisted(() => vi.fn())
const repairIconsState = vi.hoisted(() => ({ candidateCount: 0, isPending: false }))
const existingEntries = vi.hoisted(() => ({ data: [] as Array<{ id: string; label?: string }> }))

vi.mock('../use-import-entries', () => ({
  useImportEntries: () => ({ mutate: importMutate, isPending: false }),
  // Real class so the component's `instanceof ImportStepError` check works.
  ImportStepError: class ImportStepError extends Error {
    step: string
    constructor(step: string, cause?: unknown) {
      super(step, { cause })
      this.step = step
    }
  },
}))

vi.mock('../use-entries', () => ({
  useAllEntries: () => ({ data: existingEntries.data }),
}))

vi.mock('../use-repair-missing-website-icons', () => ({
  useRepairMissingWebsiteIcons: () => ({ ...repairIconsState, mutate: repairIconsMutate }),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const toastInfo = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError, info: toastInfo } }))

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

function csvFile(): File {
  const csv = 'name,url,username,password,note\nGitHub,https://github.com,octocat,pw,mine'
  return new File([csv], 'export.csv', { type: 'text/csv' })
}

async function uploadCsv(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, csvFile())
}

describe('ImportWizardModal', () => {
  beforeEach(() => {
    importMutate.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    toastInfo.mockReset()
    repairIconsMutate.mockReset()
    Object.assign(repairIconsState, { candidateCount: 0, isPending: false })
    existingEntries.data = []
    useAuthStore.setState({
      privateKey: new Uint8Array(32),
      permissions: PERMISSION_VAULT_MANAGE,
    })
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <ImportWizardModal open={false} vault={VAULT} onClose={vi.fn()} />,
      { wrapper },
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the upload step with a dropzone', () => {
    render(<ImportWizardModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByText(/import entries/i)).toBeInTheDocument()
    expect(screen.getByText(/drop a file/i)).toBeInTheDocument()
  })

  it('does not crash when the zero-knowledge entry list omits plaintext labels', () => {
    existingEntries.data = [{ id: 'opaque-entry' }]
    render(<ImportWizardModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByText(/import entries/i)).toBeInTheDocument()
  })

  it('offers missing-icon repair in the import configurator', async () => {
    repairIconsState.candidateCount = 120
    render(<ImportWizardModal open vault={VAULT} onClose={vi.fn()} />, { wrapper })

    expect(screen.getByText('Active credentials without a website icon: 120')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Repair icons' }))

    expect(repairIconsMutate).toHaveBeenCalledWith(
      { onProgress: expect.any(Function) },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('parses an uploaded file and imports it (happy path)', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <ImportWizardModal open vault={VAULT} onClose={onClose} />,
      { wrapper },
    )

    await uploadCsv(container)

    // Preview step — format detected + entry visible.
    expect(await screen.findByText(/Chrome \/ Edge \/ Brave/i)).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^import$/i }))

    expect(importMutate).toHaveBeenCalledTimes(1)
    const [input, options] = importMutate.mock.calls[0]
    expect(input.vaultId).toBe('vault-1')
    expect(input.creates).toHaveLength(1)
    expect(input.creates[0].label).toBe('GitHub')

    // Drive the success callback → done step.
    options.onSuccess({ importedCount: 1, updatedCount: 0, failed: [] })
    expect(await screen.findByText(/import complete/i)).toBeInTheDocument()
  })

  it('surfaces an error toast when the import mutation fails', async () => {
    const { container } = render(
      <ImportWizardModal open vault={VAULT} onClose={vi.fn()} />,
      { wrapper },
    )

    await uploadCsv(container)
    await screen.findByText('GitHub')
    await userEvent.click(screen.getByRole('button', { name: /^import$/i }))

    const [, options] = importMutate.mock.calls[0]
    options.onError(new Error('boom'))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/import failed/i))
  })

  it('closes and clears the plaintext preview when the vault locks', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <ImportWizardModal open vault={VAULT} onClose={onClose} />,
      { wrapper },
    )
    await uploadCsv(container)
    expect(await screen.findByText('GitHub')).toBeInTheDocument()
    useAuthStore.setState({ privateKey: null })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
