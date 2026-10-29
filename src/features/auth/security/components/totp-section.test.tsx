import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { ACCOUNT_QUERY_KEY } from '../../../../shared/api/account-api'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TotpSection } from './totp-section'

const getAccount = vi.hoisted(() => vi.fn())

vi.mock('../../../../shared/api/account-api', async (importActual) => ({
  ...(await importActual<typeof import('../../../../shared/api/account-api')>()),
  getAccount,
}))

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TotpSection />
    </QueryClientProvider>,
  )
  return client
}

describe('TotpSection', () => {
  beforeEach(() => {
    getAccount.mockReset()
  })

  it('is offered to accounts with a login password credential', async () => {
    getAccount.mockResolvedValue({ totpEnabled: false, kdf: { credentialRevision: 1 } })
    renderSection()
    expect(await screen.findByRole('button', { name: /enable/i })).toBeInTheDocument()
  })

  it('is hidden for accounts without a login password credential', async () => {
    getAccount.mockResolvedValue({ totpEnabled: false, kdf: { credentialRevision: 0 } })
    const client = renderSection()
    await waitFor(() => expect(client.getQueryState(ACCOUNT_QUERY_KEY)?.status).toBe('success'))
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
