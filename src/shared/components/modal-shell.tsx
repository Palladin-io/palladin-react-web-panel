import { useEffect, type ReactNode } from 'react'

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
  /** Footer content (usually the DialogFooter buttons). Only used with `title`. */
  footer?: ReactNode
  /** Max width of the dialog in px. Defaults to 480 (use 560 for forms). */
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
  footer,
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

  const backdrop = (
    <div aria-hidden onClick={onClose} className="absolute inset-0 h-full w-full bg-black/60" />
  )

  if (title !== undefined) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
      >
        {backdrop}
        <div
          className="relative z-10 flex max-h-[86vh] w-full flex-col overflow-hidden rounded-2xl
            border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] shadow-xl"
          style={{ maxWidth: width }}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--cv-divider)] px-5 py-3.5">
            <h2 className="text-[14px] font-semibold text-[var(--cv-t1)]">{title}</h2>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex shrink-0 text-[var(--cv-icon-muted)] transition-colors hover:text-[var(--cv-t1)]"
              >
                <span className="mi" style={{ fontSize: 18 }} aria-hidden>close</span>
              </button>
            ) : null}
          </header>
          <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-[var(--cv-divider)] px-5 py-3.5">{footer}</div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      {backdrop}
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
