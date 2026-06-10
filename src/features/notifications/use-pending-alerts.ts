import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Attention alerts for incoming pending notifications (new agent / new access
 * request) while the tab is open: a subtle sound + a flashing browser tab title
 * (Facebook-style). Wired into the SignalR handler.
 *
 * Only "needs attention" types (`grant_pending` / `agent_pending`) trigger this
 * — approved/denied/revoked stay quiet so we don't nag.
 *
 * Reset (stop flashing, restore title, zero the unseen counter) happens when the
 * user returns to the tab (focus / visibilitychange → visible) or lands on the
 * Approvals view (the consumer calls `reset()` there).
 */

const FLASH_INTERVAL_MS = 1000
const SOUND_DEBOUNCE_MS = 1500

export function usePendingAlerts() {
  const { t } = useTranslation()

  const unseenRef = useRef(0)
  const originalTitleRef = useRef<string | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const showingAlertTitleRef = useRef(false)
  const lastSoundAtRef = useRef(0)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const stopFlashing = useCallback(() => {
    if (flashTimerRef.current !== null) {
      clearInterval(flashTimerRef.current)
      flashTimerRef.current = null
    }
    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current
      originalTitleRef.current = null
    }
    showingAlertTitleRef.current = false
  }, [])

  /** Stop flashing, restore the title, and clear the unseen counter. */
  const reset = useCallback(() => {
    unseenRef.current = 0
    stopFlashing()
  }, [stopFlashing])

  const alertTitle = useCallback(
    () => t('notifications.pendingTitle', { count: unseenRef.current }),
    [t],
  )

  const startFlashing = useCallback(() => {
    if (flashTimerRef.current !== null) return // already flashing
    // Capture the real title once so we can restore it exactly.
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title
    }
    document.title = alertTitle()
    showingAlertTitleRef.current = true
    flashTimerRef.current = setInterval(() => {
      if (showingAlertTitleRef.current) {
        document.title = originalTitleRef.current ?? document.title
      } else {
        document.title = alertTitle()
      }
      showingAlertTitleRef.current = !showingAlertTitleRef.current
    }, FLASH_INTERVAL_MS)
  }, [alertTitle])

  /** Subtle generated "ding" via Web Audio — no asset to bundle. */
  const playDing = useCallback(() => {
    const now = Date.now()
    if (now - lastSoundAtRef.current < SOUND_DEBOUNCE_MS) return // debounce bursts
    lastSoundAtRef.current = now

    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return
      const ctx = audioCtxRef.current ?? new Ctor()
      audioCtxRef.current = ctx

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime) // A5 — gentle chime
      // Quick attack, short decay — a soft, unobtrusive blip.
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
    } catch {
      // Autoplay blocked or Web Audio unavailable — silently skip.
    }
  }, [])

  /** Call on each `grant_pending` / `agent_pending` event. */
  const notifyPending = useCallback(() => {
    unseenRef.current += 1
    playDing()
    // If the user is already looking at the tab, flashing the title is pointless
    // — only flash when the tab is hidden/unfocused.
    if (document.visibilityState === 'hidden' || !document.hasFocus()) {
      if (flashTimerRef.current !== null) {
        // Already flashing — refresh the alert title now so the new count shows
        // immediately rather than on the next interval tick.
        document.title = alertTitle()
        showingAlertTitleRef.current = true
      } else {
        startFlashing()
      }
    }
  }, [playDing, startFlashing, alertTitle])

  // Returning to the tab clears the alert state.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reset()
    }
    const onFocus = () => reset()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      stopFlashing()
    }
  }, [reset, stopFlashing])

  return { notifyPending, reset }
}
