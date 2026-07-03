import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './copy-button'

const writeTextMock = vi.fn(async () => {})

describe('CopyButton', () => {
  beforeEach(() => {
    writeTextMock.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    })
  })

  it('copies the value and flips to the copied state', async () => {
    render(<CopyButton value="sk_live_secret" />)

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    expect(writeTextMock).toHaveBeenCalledWith('sk_live_secret')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument(),
    )
  })

  it('is disabled when there is nothing to copy', () => {
    render(<CopyButton value="" />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
