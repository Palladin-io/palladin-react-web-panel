import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIPBOARD_CLEAR_MS } from '../lib/clipboard'
import { CopyButton } from './copy-button'

const writeTextMock = vi.fn(async () => {})
const readTextMock = vi.fn(async () => '')

describe('CopyButton', () => {
  beforeEach(() => {
    writeTextMock.mockClear()
    readTextMock.mockReset().mockResolvedValue('')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock, readText: readTextMock },
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
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

  it('auto-clears a copied secret when the clipboard is unchanged', async () => {
    vi.useFakeTimers()
    readTextMock.mockResolvedValue('historical-secret')
    render(<CopyButton value="historical-secret" secret />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy/i }))
      await Promise.resolve()
    })
    expect(writeTextMock).toHaveBeenCalledWith('historical-secret')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS)
    })
    expect(writeTextMock).toHaveBeenLastCalledWith('')
  })
})
