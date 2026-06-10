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

  it('blocks confirm with an empty expiry (default = Time Limited)', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText(/choose an expiry/i)).toBeInTheDocument()
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
