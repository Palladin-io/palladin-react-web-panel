import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AUTH_BACKGROUND_GRADIENT } from '../../../shared/lib/styles'

export interface RecoveryShellProps {
  title: string
  subtitle: ReactNode
  children: ReactNode
  /** When provided, a back chevron is shown top-left. */
  onBack?: () => void
}

/**
 * Shared chrome for every recovery step — centred card on the same
 * gradient background the unlock screen uses, with an optional back
 * button that doubles as the step-reversal affordance.
 */
export function RecoveryShell({ title, subtitle, children, onBack }: RecoveryShellProps) {
  const { t } = useTranslation()

  return (
    <div
      className="dark flex min-h-screen items-center justify-center"
      style={{ background: AUTH_BACKGROUND_GRADIENT }}
    >
      <div className="w-full max-w-[27.5rem] px-6 py-10">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('common.back')}
            className="mb-4 flex h-8 w-8 items-center justify-center rounded-full
              text-[#B8C5D4] transition-colors hover:bg-[rgba(232,234,237,0.08)] hover:text-[#E8EAED]"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        <div className="text-center">
          <img
            src="/logo.png"
            alt={t('auth.appName')}
            className="mx-auto mb-4 h-16 w-16"
          />
          <h1 className="mb-1 text-auth-title font-bold leading-tight text-[#E8EAED]">
            {title}
          </h1>
          <p className="mb-7 text-heading-sm text-[#6B7A8E]">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
