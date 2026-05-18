import { useEffect, type ReactNode } from 'react'

export interface ModalShellProps {
  /** Optional handler — when omitted, the backdrop and Escape key are inert. */
  onClose?: () => void
  ariaLabel: string
  /** Max width of the dialog in px. Defaults to 480. */
  width?: number
  children: ReactNode
}

/**
 * Minimal modal scaffold shared across feature dialogs. Handles the
 * backdrop, Escape-key dismissal, and body scroll lock so feature
 * components stay focused on their form content.
 *
 * The backdrop is rendered as a non-focusable `<div>` with `aria-hidden`
 * so screen-reader rotor lists don't end up with two "Close" entries —
 * the dialog body always renders its own X / Close affordance.
 */
export function ModalShell({
  onClose,
  ariaLabel,
  width = 480,
  children,
}: ModalShellProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/60"
      />
      <div
        className="relative z-10 w-full rounded-2xl border border-[var(--cv-border)]
          bg-[var(--cv-modal-bg)] p-6 shadow-xl"
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  )
}
