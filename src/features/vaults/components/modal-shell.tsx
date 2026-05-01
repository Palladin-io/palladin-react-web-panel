import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface ModalShellProps {
  /** Optional handler — when omitted, the backdrop and Escape key are inert. */
  onClose?: () => void
  ariaLabel: string
  /** Max width of the dialog in px. Defaults to 480 to keep prior callers stable. */
  width?: number
  children: ReactNode
}

/**
 * Minimal modal scaffold shared by the vault dialogs. Handles the backdrop,
 * Escape-key dismissal, and body scroll lock so feature components stay
 * focused on their form content. Intentionally lean — when we need full
 * a11y (focus trap, return focus on close) we'll lift this into shared/.
 */
export function ModalShell({
  onClose,
  ariaLabel,
  width = 480,
  children,
}: ModalShellProps) {
  const { t } = useTranslation()
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
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <div
        className="relative z-10 w-full rounded-2xl border border-[rgba(253,249,228,0.08)]
          bg-[#0D1B3E] p-6 shadow-xl"
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  )
}
