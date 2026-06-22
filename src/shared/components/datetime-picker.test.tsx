import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateTimePicker } from './datetime-picker'

function renderPicker(overrides: Partial<Parameters<typeof DateTimePicker>[0]> = {}) {
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  const anchorRef = createRef<HTMLElement>()
  // @ts-expect-error — assigning a stable element to the ref for the test.
  anchorRef.current = anchor

  const onChange = vi.fn()
  const onClose = vi.fn()
  render(
    <DateTimePicker
      value=""
      min={new Date('2026-06-15T12:00')}
      anchorRef={anchorRef}
      onChange={onChange}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onChange, onClose }
}

describe('DateTimePicker', () => {
  it('returns a datetime-local string for the chosen day + time', async () => {
    const user = userEvent.setup()
    const { onChange, onClose } = renderPicker({
      value: '2026-06-20T09:30',
      min: new Date('2026-06-01T00:00'),
    })

    // Pick day 25 in the visible (June 2026) grid.
    await user.click(screen.getByRole('button', { name: '25' }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toBe('2026-06-25T09:30')
    expect(onClose).toHaveBeenCalled()
  })

  it('disables days before the min day', () => {
    renderPicker({
      value: '2026-06-15T13:00',
      min: new Date('2026-06-15T12:00'),
    })
    // The 10th is before the min day → disabled; the 20th is after → enabled.
    expect(screen.getByRole('button', { name: '10' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '20' })).not.toBeDisabled()
  })

  it('closes on Escape without committing', async () => {
    const user = userEvent.setup()
    const { onChange, onClose } = renderPicker()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
