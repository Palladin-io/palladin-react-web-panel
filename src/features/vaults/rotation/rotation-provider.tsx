import { useEffect, type ReactNode } from 'react'
import { VaultRotationEngine } from './rotation-engine'
import { useRotationStore } from './rotation-store'

const engine = new VaultRotationEngine()
const ROTATION_POLL_INTERVAL_MS = 60_000

interface RotationProviderProps {
  children: ReactNode
  enabled: boolean
  memberId: string | null
  memberPrivateKey: Uint8Array | null
}

export function RotationProvider({ children, enabled, memberId, memberPrivateKey }: RotationProviderProps) {
  useEffect(() => {
    if (!enabled || !memberId || !memberPrivateKey) {
      useRotationStore.getState().clear()
      return
    }

    let active: AbortController | null = null
    let timer: number | null = null
    let disposed = false
    let resumeRequested = false
    const schedule = () => {
      if (disposed) return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(run, ROTATION_POLL_INTERVAL_MS)
    }
    const run = () => {
      if (disposed || active || !navigator.onLine || document.visibilityState !== 'visible') return
      const controller = new AbortController()
      active = controller
      void engine.run(memberId, memberPrivateKey, controller.signal)
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          useRotationStore.getState().update({ phase: 'error', errorCode:
            error instanceof Error && error.message.includes('409') ? 'rotation-lease-conflict' : 'rotation-retry-required' })
        })
        .finally(() => {
          if (active === controller) active = null
          if (disposed) return
          if (resumeRequested && navigator.onLine && document.visibilityState === 'visible') {
            resumeRequested = false
            run()
            return
          }
          schedule()
        })
    }
    const pause = () => {
      active?.abort(new DOMException('Vault rotation paused', 'AbortError'))
      useRotationStore.getState().update({ phase: 'paused', errorCode: null })
    }
    const resume = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return
      if (active) {
        resumeRequested = true
        return
      }
      run()
    }
    const visibilityChanged = () => document.visibilityState === 'visible' ? resume() : pause()

    run()
    window.addEventListener('offline', pause)
    window.addEventListener('online', resume)
    window.addEventListener('pagehide', pause)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      disposed = true
      resumeRequested = false
      if (timer !== null) window.clearTimeout(timer)
      active?.abort(new DOMException('Vault locked or navigation changed', 'AbortError'))
      window.removeEventListener('offline', pause)
      window.removeEventListener('online', resume)
      window.removeEventListener('pagehide', pause)
      document.removeEventListener('visibilitychange', visibilityChanged)
      useRotationStore.getState().clear()
    }
  }, [enabled, memberId, memberPrivateKey])

  return children
}
