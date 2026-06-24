import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveGrantDialog } from './approve-grant-dialog'
import type { PendingGrant } from '../api/pending-grants-api'

const grant: PendingGrant = {
  id: 'g1',
  vaultId: 'v1',
  vaultName: 'Production',
  agentId: 'a1',
  agentName: 'Deploy Bot',
  agentPublicKey: 'PUBKEY',
  entryId: 'e1',
  entryLabel: 'Gmail',
  reason: 'Need it',
  createdAt: '2026-06-01T10:00:00Z',
}

describe('ApproveGrantDialog — access type dropdown', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    onConfirm.mockReset()
    onCancel.mockReset()
  })

  function renderDialog() {
    render(
      <ApproveGrantDialog
        grant={grant}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
  }

  it('renders the title, the agent/entry/vault names, and the access-type dropdown', () => {
    renderDialog()
    expect(screen.getByText('Approve Access')).toBeInTheDocument()
    // Subtitle emphasises the agent + vault names and shows the entry by name.
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText('Gmail')).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    const select = screen.getByLabelText(/Access type/i)
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Time Limited/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Number of Uses/i })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: /Lifetime \(never expires\)/i }),
    ).toBeInTheDocument()
  })

  it('defaults Time Limited to a future expiry and confirms with it', async () => {
    const user = userEvent.setup()
    renderDialog()
    // Time Limited is the default kind; the expiry pre-fills to ~1 day ahead,
    // shown as a relative distance ("in 23 hours" / "in 1 day").
    expect(screen.getByText(/Expires in \d+ (hour|day)/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toHaveProperty('expiresAt')
  })

  it('a quick-duration chip sets the expiry', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: '6h' }))
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const body = onConfirm.mock.calls[0][0]
    expect(body).toHaveProperty('expiresAt')
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('a quick-minutes chip sets the expiry', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: '15min' }))
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toHaveProperty('expiresAt')
  })

  it('Custom opens the on-brand date-time picker', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /custom/i }))
    expect(
      screen.getByRole('dialog', { name: /choose date and time/i }),
    ).toBeInTheDocument()
  })

  it('confirms with queryLimit only when Number of Uses is selected', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText(/Access type/i), 'uses')
    await user.type(screen.getByLabelText(/Maximum uses/i), '3')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    // Methods default to the privacy-preserving set when the grant requested none.
    expect(onConfirm).toHaveBeenCalledWith({ queryLimit: 3 }, ['exec', 'inject'])
  })

  it('confirms with an empty body when Lifetime is selected (neither field)', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText(/Access type/i), 'lifetime')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({}, ['exec', 'inject'])
  })

  it('rejects an invalid usage limit', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText(/Access type/i), 'uses')
    await user.type(screen.getByLabelText(/Maximum uses/i), '0')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
