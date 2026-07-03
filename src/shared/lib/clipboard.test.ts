import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIPBOARD_CLEAR_MS, copySecretToClipboard } from './clipboard'

describe('copySecretToClipboard', () => {
  let writeText: ReturnType<typeof vi.fn>
  let readText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    writeText = vi.fn(async () => {})
    readText = vi.fn(async () => '')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText, readText },
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('copies the secret and auto-clears it after the window when unchanged', async () => {
    readText.mockResolvedValue('s3cret')

    const ok = await copySecretToClipboard('s3cret')
    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith('s3cret')

    writeText.mockClear()
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS)

    // Clipboard still held the secret → it is wiped.
    expect(writeText).toHaveBeenCalledWith('')
  })

  it('does not clear when the user has since copied something else', async () => {
    readText.mockResolvedValue('user-copied-this-later')

    await copySecretToClipboard('old-secret')
    writeText.mockClear()
    await vi.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS)

    expect(writeText).not.toHaveBeenCalledWith('')
  })

  it('a newer secret copy supersedes the earlier clear timer', async () => {
    readText.mockResolvedValue('newer')

    await copySecretToClipboard('older', 10_000)
    await copySecretToClipboard('newer', 10_000)

    writeText.mockClear()
    await vi.advanceTimersByTimeAsync(10_000)

    // Only the surviving (newer) timer clears the clipboard, exactly once.
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('')
  })
})
