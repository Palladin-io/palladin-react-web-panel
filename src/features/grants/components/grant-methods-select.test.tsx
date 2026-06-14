import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrantMethodsSelect } from './grant-methods-select'

describe('GrantMethodsSelect', () => {
  it('summarises selected methods on the trigger and stays compact (options hidden until opened)', () => {
    render(<GrantMethodsSelect idPrefix="t" value={['exec', 'inject']} onChange={vi.fn()} />)
    // Summary on the trigger.
    expect(screen.getByRole('combobox')).toHaveTextContent(/Exec, Inject/)
    // Options are not rendered until the dropdown is opened.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens the dropdown and toggles a method (multi-select keeps the list open)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<GrantMethodsSelect idPrefix="t" value={['exec']} onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(screen.getByText(/Get \(plaintext\)/i))
    expect(onChange).toHaveBeenCalledWith(['exec', 'get'])
  })

  it('reveals the amber Warning Zone only when get is selected (animated, aria-hidden when not)', () => {
    const zone = () => screen.getByText(/Warning Zone/i).closest('[aria-hidden]')

    const { rerender } = render(<GrantMethodsSelect idPrefix="t" value={['exec']} onChange={vi.fn()} />)
    // The zone is always in the DOM (so it can animate) but hidden until get is chosen.
    expect(zone()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText(/leave the machine/i)).toBeInTheDocument()

    rerender(<GrantMethodsSelect idPrefix="t" value={['get']} onChange={vi.fn()} />)
    expect(zone()).toHaveAttribute('aria-hidden', 'false')
  })

  it('flags requested methods inside the dropdown', async () => {
    const user = userEvent.setup()
    render(<GrantMethodsSelect idPrefix="t" value={['exec']} requested={['exec']} onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    expect(screen.getByText(/requested/i)).toBeInTheDocument()
  })

  it('shows a placeholder when nothing is selected', () => {
    render(<GrantMethodsSelect idPrefix="t" value={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveTextContent(/Select how the agent/i)
  })
})
