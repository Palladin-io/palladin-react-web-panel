import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { ProgressDots } from './progress-dots'

export interface OnboardingShellProps {
  title: string
  subtitle: ReactNode
  stepIndex: number
  totalSteps: number
  children: ReactNode
  /** When provided, a back arrow appears to the left of the progress dots. */
  onBack?: () => void
}

/**
 * Shared chrome for all three onboarding steps — centred card on the
 * gradient background, progress dots, and a consistent title block.
 */
export function OnboardingShell({
  title,
  subtitle,
  stepIndex,
  totalSteps,
  children,
  onBack,
}: OnboardingShellProps) {
  return (
    <div className="auth-surface flex min-h-screen items-start justify-center pt-[max(2rem,calc(50vh-22.5rem))]">
      <div className="step-enter w-full max-w-[27.5rem] px-6 py-10">
        <div className="relative flex items-center justify-center">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-full
                text-[var(--cv-auth-secondary)] transition-colors hover:bg-[var(--cv-bg-subtle)]
                hover:text-[var(--cv-t1)]"
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <ProgressDots current={stepIndex} total={totalSteps} />
        </div>

        <div className="mt-6 mb-6 text-center">
          <h1 className="mb-1 text-auth-title font-bold leading-tight text-[var(--cv-t1)]">
            {title}
          </h1>
          <p className="text-heading-sm text-[var(--cv-auth-muted)]">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
