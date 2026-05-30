import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AgentTypeCombobox } from './agent-type-combobox'

const TYPE_VALUES = ['claudeCode', 'cursor', 'other']

describe('AgentTypeCombobox', () => {
  it('renders the combobox input with its label', () => {
    render(
      <AgentTypeCombobox
        typeValues={TYPE_VALUES}
        inputValue=""
        onInputChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
  })

  it('opens the suggestion list on focus and selects an option', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <AgentTypeCombobox
        typeValues={TYPE_VALUES}
        inputValue=""
        onInputChange={vi.fn()}
        onSelect={onSelect}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    const option = screen.getByRole('button', { name: /claude code/i })
    await user.click(option)

    expect(onSelect).toHaveBeenCalledWith('claudeCode', 'Claude Code')
  })

  it('forwards free-form typing through onInputChange', async () => {
    const user = userEvent.setup()
    const onInputChange = vi.fn()

    render(
      <AgentTypeCombobox
        typeValues={TYPE_VALUES}
        inputValue=""
        onInputChange={onInputChange}
        onSelect={vi.fn()}
      />,
    )

    await user.type(screen.getByRole('combobox'), 'x')
    expect(onInputChange).toHaveBeenCalledWith('x')
  })

  it('disables the input when disabled', () => {
    render(
      <AgentTypeCombobox
        typeValues={TYPE_VALUES}
        inputValue=""
        onInputChange={vi.fn()}
        onSelect={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
