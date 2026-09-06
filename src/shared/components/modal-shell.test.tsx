import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModalShell } from './modal-shell'

describe('ModalShell', () => {
  it('keeps focus while callbacks change, skips hidden controls, and restores focus on unmount', async () => {
    const user = userEvent.setup()
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const body = <><button hidden>Hidden</button><button tabIndex={-1}>Skipped</button><input aria-label="Name" /><button>Approve</button></>
    const view = render(<ModalShell ariaLabel="Pair" title="Pair" trapFocus onClose={vi.fn()}>{body}</ModalShell>)
    await user.tab()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    view.rerender(<ModalShell ariaLabel="Pair" title="Pair" trapFocus onClose={vi.fn()}>{body}</ModalShell>)
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    view.unmount()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
    trigger.remove()
  })

  it('honors a child consuming Escape before dismissing the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ModalShell ariaLabel="Pair" title="Pair" trapFocus onClose={onClose}>
      <input aria-label="Type" onKeyDown={(event) => event.preventDefault()} />
    </ModalShell>)
    await user.click(screen.getByLabelText('Type'))
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dismisses only the topmost dialog and restores focus to its parent', async () => {
    const user = userEvent.setup()
    const parentClose = vi.fn()
    function Host() {
      const [childOpen, setChildOpen] = useState(false)
      return <ModalShell ariaLabel="Parent" title="Parent" trapFocus onClose={parentClose}>
        <button onClick={() => setChildOpen(true)}>Choose icon</button>
        {childOpen && <ModalShell ariaLabel="Icons" title="Icons" trapFocus onClose={() => setChildOpen(false)}>
          <button>Icon</button>
        </ModalShell>}
      </ModalShell>
    }
    render(<Host />)
    await user.click(screen.getByRole('button', { name: 'Choose icon' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Icons' })).not.toBeInTheDocument()
    expect(parentClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Choose icon' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(parentClose).toHaveBeenCalledOnce()
  })

})
