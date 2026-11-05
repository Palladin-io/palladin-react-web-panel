import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { AddPhoneState } from '../../hooks/use-add-phone-transfer'
import { AddPhoneDialog } from './add-phone-dialog'

const transfer = vi.hoisted(() => ({
  state: { step: 'starting' } as AddPhoneState, approve: vi.fn(), reject: vi.fn(), restart: vi.fn(),
}))
vi.mock('../../hooks/use-add-phone-transfer', () => ({ useAddPhoneTransfer: () => transfer }))

const accountId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => vi.clearAllMocks())

it('shows sending progress on the approve action while keeping the compared code', () => {
  transfer.state = { step: 'sending', sas: '942en-qbszg' }
  render(<AddPhoneDialog accountId={accountId} onClose={vi.fn()} />)
  expect(screen.getByTestId('pairing-sas')).toHaveTextContent('942en-qbszg')
  expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled()
})

it.each([
  ['expired', /this code has expired/i],
  ['unavailable', /the other device cancelled, or this request is no longer valid/i],
] as const)('offers a new code instead of approval once the transfer is %s', (step, message) => {
  transfer.state = { step }
  render(<AddPhoneDialog accountId={accountId} onClose={vi.fn()} />)
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /new code/i })).toBeEnabled()
})
