import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RevokeGrantDialog } from './revoke-grant-dialog'

describe('RevokeGrantDialog', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    onConfirm.mockReset()
    onCancel.mockReset()
  })

  function renderOpen() {
    render(
      <RevokeGrantDialog
        open
        targetLabel="Gmail"
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
  }

  it('renders nothing when closed', () => {
    const { container } = render(
      <RevokeGrantDialog
        open={false}
        targetLabel="Gmail"
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('confirms with the trimmed reason', async () => {
    const user = userEvent.setup()
    renderOpen()
    await user.type(screen.getByLabelText(/reason/i), '  leak  ')
    await user.click(screen.getByRole('button', { name: /^revoke$/i }))
    expect(onConfirm).toHaveBeenCalledWith('leak')
  })

  it('confirms with empty reason when none entered', async () => {
    const user = userEvent.setup()
    renderOpen()
    await user.click(screen.getByRole('button', { name: /^revoke$/i }))
    expect(onConfirm).toHaveBeenCalledWith('')
  })

  it('blocks confirm when the reason exceeds the max length', async () => {
    const user = userEvent.setup()
    renderOpen()
    const textarea = screen.getByLabelText(/reason/i)
    // 501 chars > 500 max
    await user.click(textarea)
    await user.paste('x'.repeat(501))
    await user.click(screen.getByRole('button', { name: /^revoke$/i }))
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
