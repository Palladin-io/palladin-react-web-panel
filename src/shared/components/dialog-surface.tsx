import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './icon'

/** Shared dialog chrome without modal semantics, backdrop or focus management. */
export function DialogSurface({ title, titleClassName, footer, footerClassName, surface = 'modal', onClose, width = 560, className, children }: {
  title?: ReactNode
  titleClassName?: string
  footer?: ReactNode
  footerClassName?: string
  surface?: 'modal' | 'auth' | 'card'
  onClose?: () => void
  width?: number
  className?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const authSurface = surface === 'auth'
  return (
    <div
      className={`flex max-h-[86dvh] w-full min-w-0 flex-col overflow-hidden rounded-2xl
        border ${authSurface
          ? 'border-[var(--cv-auth-control-border)] bg-[var(--cv-auth-control-bg)]'
          : surface === 'card' ? 'border-[var(--cv-border)] bg-[var(--cv-card-bg)]'
            : 'border-[var(--cv-border)] bg-[var(--cv-modal-bg)]'} ${className ?? ''}`}
      style={{ maxWidth: `calc(${width}px * var(--cv-density-scale))` }}
    >
      {title != null ? <header className={`flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4 sm:px-6 ${authSurface
        ? 'border-[var(--cv-auth-divider)]' : 'border-[var(--cv-divider)]'}`}>
        <h2 className={`${titleClassName ?? 'text-heading'} font-semibold text-[var(--cv-t1)]`}>
          {title}
        </h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex shrink-0 text-[var(--cv-icon-muted)] transition-colors hover:text-[var(--cv-t1)]"
          >
            <Icon name="close" size={18} />
          </button>
        ) : null}
      </header> : null}
      <div className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
        {children}
      </div>
      {footer ? (
        <div
          data-testid="modal-footer"
          className={`shrink-0 border-t px-4 py-4 sm:px-6 ${authSurface
            ? 'border-[var(--cv-auth-divider)]' : 'border-[var(--cv-divider)]'} ${footerClassName ?? ''}`}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}
