import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppWordmark } from '../../../shared/components/app-wordmark'

export interface RecoveryShellProps {
  title: string
  subtitle: ReactNode
  children: ReactNode
  /** When provided, a back chevron is shown top-left. */
  onBack?: () => void
}

/**
 * Shared chrome for every recovery step. It follows the persisted theme and
 * provides an optional back button that doubles as the step-reversal affordance.
 */
export function RecoveryShell({ title, subtitle, children, onBack }: RecoveryShellProps) {
  const { t } = useTranslation()

  return (
    <div className="auth-surface flex min-h-screen items-center justify-center">
      <div className="w-full max-w-[27.5rem] px-6 py-10">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="mb-4 flex h-8 w-8 items-center justify-center rounded-full
              text-[var(--cv-auth-secondary)] transition-colors hover:bg-[var(--cv-bg-subtle)]
              hover:text-[var(--cv-t1)]"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        <div className="text-center">
          <div className="auth-brand-header">
            <AppWordmark size="hero" />
          </div>
          <h2 className="mb-1 text-auth-title font-bold leading-tight text-[var(--cv-t1)]">
            {title}
          </h2>
          <p className="mb-7 text-heading-sm text-[var(--cv-auth-muted)]">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
