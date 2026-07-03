import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SecretInput } from './secret-input'

const writeTextMock = vi.fn(async () => {})

function noop() {}

describe('SecretInput — copyable', () => {
  beforeEach(() => {
    writeTextMock.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    })
  })

  it('copies the value WITHOUT revealing it', async () => {
    const onToggleShown = vi.fn()
    render(
      <SecretInput
        id="secret"
        label="Password"
        value="P@ssw0rd!"
        onChange={noop}
        shown={false}
        onToggleShown={onToggleShown}
        copyable
        copyLabel="Copy password"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /copy password/i }))

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('P@ssw0rd!'))
    // Copying must never toggle the show/hide state.
    expect(onToggleShown).not.toHaveBeenCalled()
  })

  it('does not render a copy button unless copyable is set', () => {
    render(
      <SecretInput
        id="secret"
        label="Password"
        value="P@ssw0rd!"
        onChange={noop}
        shown={false}
        onToggleShown={noop}
      />,
    )
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument()
  })
})
