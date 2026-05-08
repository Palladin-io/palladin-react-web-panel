import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeleteConfirmDialog } from './delete-confirm-dialog'

describe('DeleteConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <DeleteConfirmDialog
        open={false}
        vaultName="Production"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the warning copy and the destructive Delete button when open', () => {
    render(
      <DeleteConfirmDialog
        open={true}
        vaultName="Production"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // The dialog shell uses the localized title as its aria-label.
    expect(
      screen.getByRole('dialog', { name: /delete "production"/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/this will permanently delete the vault/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument()
  })

  it('invokes onConfirm when the Delete button is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <DeleteConfirmDialog
        open={true}
        vaultName="Production"
        isPending={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('invokes onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(
      <DeleteConfirmDialog
        open={true}
        vaultName="Production"
        isPending={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables both action buttons while a delete is in flight', () => {
    render(
      <DeleteConfirmDialog
        open={true}
        vaultName="Production"
        isPending={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // Pending swaps the label to "Deleting…" to telegraph progress.
    expect(screen.getByRole('button', { name: /deleting/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled()
  })
})
