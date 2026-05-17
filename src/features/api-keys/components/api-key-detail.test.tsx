import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiKeySummary } from '../api/api-keys-api'
import { ApiKeyDetail } from './api-key-detail'

const revokeMutateMock = vi.fn()
let revokeIsPending = false

vi.mock('../use-revoke-api-key', () => ({
  useRevokeApiKey: () => ({
    mutate: revokeMutateMock,
    get isPending() {
      return revokeIsPending
    },
  }),
}))

const captureMock = vi.fn()
vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: (...args: unknown[]) => captureMock(...args) },
}))

const activeKey: ApiKeySummary = {
  apiKeyId: 'key-1',
  name: 'CI pipeline',
  status: 'active',
  createdAt: '2026-05-17T10:00:00Z',
}

const revokedKey: ApiKeySummary = {
  apiKeyId: 'key-2',
  name: 'Old key',
  status: 'revoked',
  createdAt: '2026-04-01T10:00:00Z',
  revokedAt: '2026-05-01T12:00:00Z',
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('ApiKeyDetail', () => {
  beforeEach(() => {
    revokeMutateMock.mockReset()
    captureMock.mockReset()
    revokeIsPending = false
  })

  it('renders the key name and active status', () => {
    render(<ApiKeyDetail apiKey={activeKey} />, { wrapper })
    expect(screen.getByText('CI pipeline')).toBeInTheDocument()
    expect(screen.getByText(/^active$/i)).toBeInTheDocument()
  })

  it('shows the revoked timestamp and hides the revoke action for a revoked key', () => {
    render(<ApiKeyDetail apiKey={revokedKey} />, { wrapper })
    // "Revoked" appears as the status badge and as the revokedAt row label.
    expect(screen.getAllByText(/^revoked$/i).length).toBeGreaterThanOrEqual(1)
    // Both createdAt and revokedAt timestamp rows render (locale-formatted).
    expect(screen.getAllByText(/2026/)).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: /^revoke$/i }),
    ).not.toBeInTheDocument()
  })

  it('revokes the key after confirmation and fires analytics', async () => {
    const user = userEvent.setup()
    revokeMutateMock.mockImplementation((_id, options) => {
      options.onSuccess()
    })

    render(<ApiKeyDetail apiKey={activeKey} />, { wrapper })

    await user.click(screen.getByRole('button', { name: /^revoke$/i }))
    await user.click(screen.getByRole('button', { name: /^revoke key$/i }))

    expect(revokeMutateMock).toHaveBeenCalledWith('key-1', expect.anything())
    expect(captureMock).toHaveBeenCalledWith('apiKeys', 'api-key-revoked')
  })

  it('shows an inline error when revoke fails', async () => {
    const user = userEvent.setup()
    revokeMutateMock.mockImplementation((_id, options) => {
      options.onError(new Error('500'))
    })

    render(<ApiKeyDetail apiKey={activeKey} />, { wrapper })

    await user.click(screen.getByRole('button', { name: /^revoke$/i }))
    await user.click(screen.getByRole('button', { name: /^revoke key$/i }))

    expect(
      await screen.findByText(/could not revoke the api key/i),
    ).toBeInTheDocument()
  })
})
