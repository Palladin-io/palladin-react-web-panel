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
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        background:
          'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)',
      }}
    >
      <div className="w-full max-w-[440px] px-6 py-10">
        <div className="relative flex items-center justify-center">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="absolute left-0 text-[#6B7A8E] transition-colors hover:text-[#FDF9E4]"
              aria-label="Go back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <ProgressDots current={stepIndex} total={totalSteps} />
        </div>

        <div className="mb-6 text-center">
          <h1 className="mb-1 text-[22px] font-bold leading-tight text-[#FDF9E4]">{title}</h1>
          <p className="text-[13px] text-[#6B7A8E]">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
