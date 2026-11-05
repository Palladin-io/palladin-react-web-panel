import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { SecretKeySection } from './secret-key-section'

const getAccount = vi.hoisted(() => vi.fn())
const stored = vi.hoisted(() => ({ data: false as boolean | undefined }))

vi.mock('../../../../shared/api/account-api', async (importActual) => ({
  ...(await importActual<typeof import('../../../../shared/api/account-api')>()),
  getAccount,
}))
vi.mock('../../../../shared/crypto/identity-kdf', () => ({ identityProfileVersion: () => 2 }))
vi.mock('../../hooks/use-secret-key', () => ({
  DEVICE_SECRET_KEY_QUERY_KEY: ['device-secret-key'],
  useDeviceSecretKeyStatus: () => stored,
  useForgetThisBrowser: () => ({ mutate: vi.fn(), isPending: false }),
}))

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SecretKeySection />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getAccount.mockReset().mockResolvedValue({ userId: 'user-1', kdf: {} })
})

it('offers forget, add phone and kit download when the Secret Key is on this browser', async () => {
  stored.data = true
  renderSection()
  expect(await screen.findByRole('button', { name: /forget this browser/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add a phone/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /download emergency kit/i })).toBeInTheDocument()
})

it('renders no empty action footer when the Secret Key is not on this browser', async () => {
  stored.data = false
  renderSection()
  const section = (await screen.findByRole('heading', { name: /secret key/i })).closest('section')!
  expect(screen.getByText(/not on this browser/i)).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(section.querySelector('.border-t')).toBeNull()
})
