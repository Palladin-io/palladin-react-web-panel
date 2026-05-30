import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateApiKeyModal } from './generate-api-key-modal'

const generateMutateMock = vi.fn()
let isPending = false

vi.mock('../use-generate-api-key', () => ({
  useGenerateApiKey: () => ({
    mutate: generateMutateMock,
    get isPending() {
      return isPending
    },
  }),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('GenerateApiKeyModal', () => {
  beforeEach(() => {
    generateMutateMock.mockReset()
    toastError.mockReset()
    isPending = false
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <GenerateApiKeyModal open={false} onClose={vi.fn()} />,
      { wrapper },
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the name field and Generate button when open', () => {
    render(<GenerateApiKeyModal open={true} onClose={vi.fn()} />, { wrapper })
    expect(screen.getByLabelText(/key name/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^generate api key$/i }),
    ).toBeInTheDocument()
  })

  it('keeps Generate disabled while the name field is empty', () => {
    render(<GenerateApiKeyModal open={true} onClose={vi.fn()} />, { wrapper })
    expect(
      screen.getByRole('button', { name: /^generate api key$/i }),
    ).toBeDisabled()
  })

  it('shows the one-time secret view on successful generation', async () => {
    const user = userEvent.setup()
    generateMutateMock.mockImplementation((_name, options) => {
      options.onSuccess({
        apiKeyId: 'key-1',
        name: 'CI pipeline',
        plaintext: 'cv_live_secret_value',
        createdAt: '2026-05-17T10:00:00Z',
      })
    })

    render(<GenerateApiKeyModal open={true} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/key name/i), 'CI pipeline')
    await user.click(
      screen.getByRole('button', { name: /^generate api key$/i }),
    )

    expect(generateMutateMock).toHaveBeenCalledWith(
      'CI pipeline',
      expect.anything(),
    )
    expect(
      await screen.findByText(/won't be shown again/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/your new api key/i)).toHaveValue(
      'cv_live_secret_value',
    )
  })

  it('surfaces an error toast when generation fails', async () => {
    const user = userEvent.setup()
    generateMutateMock.mockImplementation((_name, options) => {
      options.onError(new Error('boom'))
    })

    render(<GenerateApiKeyModal open={true} onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText(/key name/i), 'CI pipeline')
    await user.click(
      screen.getByRole('button', { name: /^generate api key$/i }),
    )

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/could not generate the api key/i))
  })
})
