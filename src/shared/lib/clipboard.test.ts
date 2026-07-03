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

  it('clears a newer secret via its own timer even if an earlier timer stalls mid-clear', async () => {
    // Stall A's clear-timer inside `readText()` so B can be copied while it is
    // suspended — the exact interleaving that used to strand B forever.
    let resolveARead: ((value: string) => void) | undefined
    readText.mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveARead = resolve)),
    )

    // A copied; its clear is scheduled 10s out.
    await copySecretToClipboard('secret-A', 10_000)

    // Fire A's timer: it enters the clear path and awaits readText() (stalled).
    await vi.advanceTimersByTimeAsync(10_000)
    expect(resolveARead).toBeDefined()

    // While A is stalled, the user copies B (schedules B's own timer 10s out).
    await copySecretToClipboard('secret-B', 10_000)

    // A's readText resolves: clipboard now holds B, so A must leave it alone AND
    // must not clobber B's `lastCopiedSecret` marker.
    resolveARead!('secret-B')
    await Promise.resolve()

    // Clipboard genuinely holds B until B's own timer wipes it.
    readText.mockResolvedValue('secret-B')
    writeText.mockClear()

    await vi.advanceTimersByTimeAsync(10_000)

    // B's marker survived → B's timer clears its own secret.
    expect(writeText).toHaveBeenCalledWith('')
  })
})
