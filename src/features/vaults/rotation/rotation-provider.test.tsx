import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultRotationEngine } from './rotation-engine'
import { RotationProvider } from './rotation-provider'

describe('RotationProvider lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  })

  it('starts only while unlocked and aborts synchronously when the vault locks', async () => {
    let signal: AbortSignal | undefined
    vi.spyOn(VaultRotationEngine.prototype, 'run').mockImplementation(async (_memberId, _privateKey, runSignal) => {
      signal = runSignal
      await new Promise<void>((resolve) => runSignal.addEventListener('abort', () => resolve(), { once: true }))
    })
    const privateKey = new Uint8Array(32).fill(7)
    const view = render(<RotationProvider enabled memberId="11111111-1111-4111-8111-111111111111" memberPrivateKey={privateKey}><div /></RotationProvider>)
    await waitFor(() => expect(signal).toBeDefined())

    view.rerender(<RotationProvider enabled={false} memberId={null} memberPrivateKey={null}><div /></RotationProvider>)

    expect(signal!.aborted).toBe(true)
  })

  it('aborts in-flight key work when the browser goes offline or navigates away', async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(VaultRotationEngine.prototype, 'run').mockImplementation(async (_memberId, _privateKey, signal) => {
      signals.push(signal)
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
    })
    render(<RotationProvider enabled memberId="11111111-1111-4111-8111-111111111111" memberPrivateKey={new Uint8Array(32)}><div /></RotationProvider>)
    await waitFor(() => expect(signals).toHaveLength(1))

    act(() => window.dispatchEvent(new Event('offline')))
    expect(signals[0].aborted).toBe(true)

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(signals).toHaveLength(2))
    act(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
    expect(signals[1].aborted).toBe(true)
  })

  it('does not restart completed cleanup after the provider unmounts', async () => {
    let finish: (() => void) | undefined
    const run = vi.spyOn(VaultRotationEngine.prototype, 'run').mockImplementation(async () => {
      await new Promise<void>((resolve) => { finish = resolve })
    })
    const view = render(<RotationProvider enabled memberId="11111111-1111-4111-8111-111111111111" memberPrivateKey={new Uint8Array(32)}><div /></RotationProvider>)
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1))

    view.unmount()
    await act(async () => { finish?.() })

    expect(run).toHaveBeenCalledTimes(1)
  })
})
