import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrantMethodsField } from './grant-methods-field'

describe('GrantMethodsField', () => {
  it('renders all three methods with the get warning', () => {
    render(<GrantMethodsField idPrefix="t" value={['exec']} onChange={vi.fn()} />)
    expect(screen.getByText(/Get \(plaintext\)/i)).toBeInTheDocument()
    expect(screen.getByText(/^Exec$/)).toBeInTheDocument()
    expect(screen.getByText(/^Inject$/)).toBeInTheDocument()
    // The get option carries an explicit LLM-exposure warning.
    expect(screen.getByText(/leave the machine/i)).toBeInTheDocument()
  })

  it('toggles a method on click', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<GrantMethodsField idPrefix="t" value={['exec']} onChange={onChange} />)

    await user.click(screen.getByLabelText(/Get \(plaintext\)/i))
    expect(onChange).toHaveBeenCalledWith(['exec', 'get'])
  })

  it('removes a selected method on click', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<GrantMethodsField idPrefix="t" value={['exec', 'inject']} onChange={onChange} />)

    await user.click(screen.getByLabelText(/Inject/i))
    expect(onChange).toHaveBeenCalledWith(['exec'])
  })

  it('marks requested methods', () => {
    render(
      <GrantMethodsField idPrefix="t" value={['exec']} requested={['exec']} onChange={vi.fn()} />,
    )
    expect(screen.getByText(/requested/i)).toBeInTheDocument()
  })
})
