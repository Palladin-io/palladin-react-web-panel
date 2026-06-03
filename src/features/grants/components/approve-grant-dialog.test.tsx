import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveGrantDialog } from './approve-grant-dialog'
import type { PendingGrant } from '../api/pending-grants-api'

const grant: PendingGrant = {
  grantId: 'g1',
  vaultId: 'v1',
  vaultName: 'Prod',
  agentId: 'a1',
  agentName: 'Deploy Bot',
  agentPublicKey: 'PUBKEY',
  entryId: 'e1',
  entryLabel: 'Gmail',
  reason: 'Need it',
  createdAt: '2026-06-01T10:00:00Z',
}

describe('ApproveGrantDialog — XOR policy', () => {
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

  it('renders the entry label and both policy options', () => {
    renderDialog()
    expect(screen.getByText(/Approve access to Gmail/i)).toBeInTheDocument()
    expect(screen.getByText(/Expires at a set time/i)).toBeInTheDocument()
    expect(screen.getByText(/Limit number of uses/i)).toBeInTheDocument()
  })

  it('blocks confirm with an empty expiry (default kind)', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText(/choose an expiry/i)).toBeInTheDocument()
  })

  it('confirms with a queryLimit policy only (XOR — no expiresAt)', async () => {
    const user = userEvent.setup()
    renderDialog()
    // Switch to the usage-limit policy.
    await user.click(screen.getByText(/Limit number of uses/i))
    await user.type(screen.getByLabelText(/Maximum uses/i), '3')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ queryLimit: 3 })
  })

  it('rejects an invalid usage limit', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText(/Limit number of uses/i))
    await user.type(screen.getByLabelText(/Maximum uses/i), '0')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
