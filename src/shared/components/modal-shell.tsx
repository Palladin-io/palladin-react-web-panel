import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react'
import { DialogSurface } from './dialog-surface'

export interface ModalShellProps {
  /** Optional handler — when omitted, the backdrop and Escape key are inert. */
  onClose?: () => void
  ariaLabel: string
  /**
   * When set, ModalShell renders the canonical dialog chrome: a header row with
   * this title + a close button and a bottom divider, a scrollable body (max
   * height, internal scroll), and — if `footer` is set — a footer with a top
   * divider. Omit `title` for the legacy bare box (children control everything).
   */
  title?: ReactNode
  /** Optional semantic type override for the canonical header title. */
  titleClassName?: string
  /** Footer content (usually the DialogFooter buttons). Only used with `title`. */
  footer?: ReactNode
  /** Optional surface treatment for the canonical footer row. */
  footerClassName?: string
  /** Move focus into the dialog, contain Tab navigation, and restore focus on close. */
  trapFocus?: boolean
  /** Design-pixel max width before density scaling. Defaults to 480 (560 for forms). */
  width?: number
  children: ReactNode
}

/**
 * Minimal modal scaffold shared across feature dialogs. Handles the backdrop,
 * Escape-key dismissal, and body scroll lock.
 *
 * Passing `title` (and optionally `footer`) opts into the canonical dialog
 * chrome — a titled header with a divider, an internally-scrolling body, and a
 * divided footer — so every dialog gets consistent chrome centrally rather than
 * hand-rolling its own header/footer. The body scrolls (never the page) and
 * clips horizontal overflow; any popover inside must portal out (see
 * `docs/architecture/dialogs.md`). Without `title`, the legacy padded box
 * renders as before.
 *
 * The backdrop is a non-focusable `aria-hidden` div so screen-reader rotor lists
 * don't end up with a duplicate "Close" entry — the header renders its own.
 */
export function ModalShell({
  onClose,
  ariaLabel,
  title,
  titleClassName,
  footer,
  footerClassName,
  trapFocus = false,
  width = 480,
  children,
}: ModalShellProps) {
  const close = useEffectEvent(() => onClose?.())
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const focusableElements = () => {
      const dialog = dialogRef.current
      if (!dialog) return []
      return Array.from(dialog.querySelectorAll<HTMLElement>([
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(','))).filter((element) => element.tabIndex >= 0
        && !element.closest('[hidden], [inert], [aria-hidden="true"]'))
    }

    const handler = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return
      if (event.key === 'Escape' && !event.defaultPrevented) close()
      if (!trapFocus || event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = focusableElements()
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handler)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    if (trapFocus) {
      const focusable = focusableElements()
      const initialFocus = focusable[0] ?? dialogRef.current
      initialFocus?.focus()
    }

    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = previousOverflow
      if (trapFocus && previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [trapFocus])

  const backdrop = (
    <div aria-hidden onClick={onClose} className="absolute inset-0 h-full w-full bg-black/60" />
  )

  if (title !== undefined) {
    return (
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={trapFocus ? -1 : undefined}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
      >
        {backdrop}
        <DialogSurface title={title} titleClassName={titleClassName} footer={footer}
          footerClassName={footerClassName} onClose={onClose} width={width} className="relative z-10 shadow-xl">
          {children}
        </DialogSurface>
      </div>
    )
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={trapFocus ? -1 : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      {backdrop}
      <div
        className="relative z-10 w-full rounded-2xl border border-[var(--cv-border)]
          bg-[var(--cv-modal-bg)] p-6 shadow-xl"
        style={{ maxWidth: `calc(${width}px * var(--cv-density-scale))` }}
      >
        {children}
      </div>
    </div>
  )
}
