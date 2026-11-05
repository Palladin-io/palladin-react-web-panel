import { encodeEmergencyKitQr, formatSecretKey } from '@palladin/crypto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { SecretKeyRequiredStep } from './secret-key-required-step'

const receive = vi.hoisted(() => ({ state: { step: 'waiting', qr: 'palladin-pair:v2:r:x.y', sas: '942en-qbszg', expiresAt: Date.now() + 120_000 }, restart: vi.fn() }))
const store = vi.hoisted(() => vi.fn())
vi.mock('../hooks/use-receive-secret-key', () => ({ useReceiveSecretKey: () => receive }))
vi.mock('../../../shared/crypto/secret-key', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/crypto/secret-key')>(), storeDeviceSecretKey: store,
}))

const accountId = '11111111-1111-4111-8111-111111111111'
const secret = Uint8Array.from({ length: 32 }, (_, index) => index)

beforeEach(() => store.mockReset().mockResolvedValue(undefined))

it('shows the one-time code to compare with the phone', () => {
  render(<SecretKeyRequiredStep accountId={accountId} onSecretKeyStored={vi.fn()} onBack={vi.fn()} />)
  expect(screen.getByTestId('pairing-sas')).toHaveTextContent('942en-qbszg')
  expect(screen.getByText(/expires in/i)).toBeInTheDocument()
})

it('stores a Secret Key typed from the kit and retries sign-in', async () => {
  const onStored = vi.fn()
  const user = userEvent.setup()
  render(<SecretKeyRequiredStep accountId={accountId} onSecretKeyStored={onStored} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /enter secret key from emergency kit/i }))
  await user.type(screen.getByLabelText(/secret key/i), formatSecretKey(accountId, secret))
  await user.click(screen.getByRole('button', { name: /^continue$/i }))
  expect(store).toHaveBeenCalledWith(accountId, expect.any(Uint8Array))
  expect(onStored).toHaveBeenCalledOnce()
})

it('explains a mistyped key and a kit of another account without storing anything', async () => {
  const user = userEvent.setup()
  render(<SecretKeyRequiredStep accountId={accountId} onSecretKeyStored={vi.fn()} onBack={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /enter secret key from emergency kit/i }))
  const input = screen.getByLabelText(/secret key/i)
  await user.type(input, 'PSK2-123')
  await user.click(screen.getByRole('button', { name: /^continue$/i }))
  expect(await screen.findByText(/doesn't look like a secret key/i)).toBeInTheDocument()

  await user.clear(input)
  await user.click(input)
  await user.paste(encodeEmergencyKitQr('22222222-2222-4222-8222-222222222222', secret))
  await user.click(screen.getByRole('button', { name: /^continue$/i }))
  expect(await screen.findByText(/doesn't match your account/i)).toBeInTheDocument()
  expect(store).not.toHaveBeenCalled()
})

it('explains a cancelled or no longer valid request and offers a new code', async () => {
  const previous = receive.state
  receive.state = { step: 'unavailable' } as unknown as typeof previous
  const user = userEvent.setup()
  render(<SecretKeyRequiredStep accountId={accountId} onSecretKeyStored={vi.fn()} onBack={vi.fn()} />)
  expect(screen.getByRole('alert')).toHaveTextContent(/the other device cancelled, or this request is no longer valid/i)
  await user.click(screen.getByRole('button', { name: /new code/i }))
  expect(receive.restart).toHaveBeenCalledOnce()
  receive.state = previous
})
