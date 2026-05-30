import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AgentIconPicker, DEFAULT_AGENT_COLOR } from './agent-icon-picker'

describe('AgentIconPicker', () => {
  it('renders the icon legend and the "more icons" trigger', () => {
    render(
      <AgentIconPicker
        value={undefined}
        onChange={vi.fn()}
        selectedColor={DEFAULT_AGENT_COLOR}
      />,
    )
    expect(screen.getByText(/^icon$/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /more icons/i }),
    ).toBeInTheDocument()
  })

  it('selecting a preset glyph forwards it through onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <AgentIconPicker
        value={undefined}
        onChange={onChange}
        selectedColor={DEFAULT_AGENT_COLOR}
      />,
    )

    // Preset buttons carry the glyph name as their text content.
    await user.click(screen.getByText('smart_toy'))
    expect(onChange).toHaveBeenCalledWith('smart_toy')
  })

  it('clicking the selected preset again clears it (toggle off)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <AgentIconPicker
        value="smart_toy"
        onChange={onChange}
        selectedColor={DEFAULT_AGENT_COLOR}
      />,
    )

    await user.click(screen.getByText('smart_toy'))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('renders the upload trigger when onFileSelected is provided', () => {
    render(
      <AgentIconPicker
        value={undefined}
        onChange={vi.fn()}
        selectedColor={DEFAULT_AGENT_COLOR}
        onFileSelected={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: /upload custom icon/i }),
    ).toBeInTheDocument()
  })

  it('disables the preset buttons when disabled', () => {
    render(
      <AgentIconPicker
        value={undefined}
        onChange={vi.fn()}
        selectedColor={DEFAULT_AGENT_COLOR}
        disabled
      />,
    )
    expect(screen.getByRole('button', { name: /more icons/i })).toBeDisabled()
  })
})
