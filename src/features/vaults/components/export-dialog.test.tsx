import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportDialog } from './export-dialog'

const exportMutate = vi.fn()
const exportReset = vi.fn()
const downloadMock = vi.hoisted(() => vi.fn())
const auditMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('../use-export-entries', () => ({
  useExportEntries: () => ({ mutate: exportMutate, reset: exportReset, isPending: false }),
}))

vi.mock('../../../shared/lib/download-file', () => ({ downloadBytesFile: downloadMock }))
vi.mock('../api/vault-api', () => ({ exportAudit: auditMock }))
vi.mock('../../../shared/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))

const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))

const VAULTS = [{ id: 'vault-1', name: 'Production' }]

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('ExportDialog', () => {
  beforeEach(() => {
    exportMutate.mockReset()
    exportReset.mockReset()
    downloadMock.mockReset()
    auditMock.mockClear()
    toastError.mockReset()
    toastSuccess.mockReset()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <ExportDialog open={false} vaults={VAULTS} onClose={vi.fn()} />,
      { wrapper },
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the format options and the plaintext warning', () => {
    render(<ExportDialog open vaults={VAULTS} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByText(/export entries/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /json/i })).toBeInTheDocument()
    expect(screen.getByText(/contains plaintext secrets/i)).toBeInTheDocument()
  })

  it('exports, downloads, and writes an audit record per vault (happy path)', async () => {
    const onClose = vi.fn()
    render(<ExportDialog open vaults={VAULTS} onClose={onClose} />, { wrapper })

    await userEvent.click(screen.getByRole('button', { name: /^export$/i }))

    expect(exportMutate).toHaveBeenCalledTimes(1)
    const [input, options] = exportMutate.mock.calls[0]
    expect(input).toEqual({
      vaults: VAULTS,
      format: 'json',
      includeArchived: false,
      includeDeleted: false,
      includeHistory: false,
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
      onFileReady: expect.any(Function),
    })

    const bytes = new TextEncoder().encode('{}')
    input.onFileReady({
      filename: 'palladin-export-2026-07-04.json',
      mime: 'application/json',
      content: bytes,
    })
    expect(downloadMock).toHaveBeenCalledWith(
      'palladin-export-2026-07-04.json',
      bytes,
      'application/json',
    )

    options.onSuccess({
      totalEntries: 3,
      perVault: [{ id: 'vault-1', count: 3 }],
      format: 'json',
    })

    expect(auditMock).toHaveBeenCalledWith('vault-1', { format: 'json', entryCount: 3 })
    expect(toastSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passes explicit archived, deleted, and history selections', async () => {
    render(<ExportDialog open vaults={VAULTS} onClose={vi.fn()} />, { wrapper })
    await userEvent.click(screen.getByRole('checkbox', { name: /archived entries/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /recently deleted entries/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /previous entry versions/i }))
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }))
    expect(exportMutate.mock.calls[0][0]).toEqual(expect.objectContaining({
      includeArchived: true,
      includeDeleted: true,
      includeHistory: true,
    }))
  })

  it('shows an error toast when the export fails', async () => {
    render(<ExportDialog open vaults={VAULTS} onClose={vi.fn()} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }))

    const [, options] = exportMutate.mock.calls[0]
    options.onError(new Error('boom'))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/export failed/i))
  })

  it('does not report cancellation as an export failure', async () => {
    render(<ExportDialog open vaults={VAULTS} onClose={vi.fn()} />, { wrapper })
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }))
    const [, options] = exportMutate.mock.calls[0]
    options.onError(new DOMException('Cancelled', 'AbortError'))
    expect(toastError).not.toHaveBeenCalled()
  })
})
