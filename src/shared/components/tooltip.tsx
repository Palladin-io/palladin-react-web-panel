import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipProps {
  /** Text shown in the tooltip. When empty, the tooltip is disabled. */
  content: string
  children: ReactNode
  /** Classes applied to the inline trigger wrapper (e.g. truncate utilities). */
  className?: string
  /** Hover/focus delay before showing, in ms. Much faster than the native title. */
  delayMs?: number
}

interface Coords {
  x: number
  y: number
}

/**
 * Lightweight tooltip that appears quickly (default 150ms) — a replacement for
 * the native `title` attribute, whose ~1.5s delay is not configurable. The
 * bubble is rendered through a portal to `document.body` and positioned with
 * `position: fixed`, so parents with `overflow-hidden` (cards, scroll areas)
 * never clip it. The trigger wrapper keeps the caller's classes, so existing
 * `truncate` layout is preserved.
 */
export function Tooltip({ content, children, className, delayMs = 150 }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [coords, setCoords] = useState<Coords | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const show = useCallback(() => {
    if (!content) return
    const el = triggerRef.current
    // Only surface the tooltip when the text is actually clipped (truncated) —
    // no point repeating content that's already fully visible.
    if (!el || el.scrollWidth <= el.clientWidth + 1) return
    clearTimer()
    timerRef.current = setTimeout(() => {
      const node = triggerRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      setCoords({ x: rect.left + rect.width / 2, y: rect.top })
    }, delayMs)
  }, [content, delayMs, clearTimer])

  const hide = useCallback(() => {
    clearTimer()
    setCoords(null)
  }, [clearTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

  return (
    <span
      ref={triggerRef}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {coords && content
        ? createPortal(
            <span
              role="tooltip"
              style={{
                position: 'fixed',
                left: coords.x,
                top: coords.y,
                transform: 'translate(-50%, calc(-100% - 6px))',
                maxWidth: 'min(320px, 90vw)',
              }}
              className="pointer-events-none z-[100] block rounded-md border border-[var(--cv-border)]
                bg-[var(--cv-modal-bg)] px-2 py-1 text-[11px] leading-snug text-[var(--cv-t1)]
                shadow-[0_4px_20px_rgba(0,0,0,0.18)]"
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
