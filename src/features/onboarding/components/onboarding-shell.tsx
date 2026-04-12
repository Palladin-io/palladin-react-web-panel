import type { ReactNode } from 'react'
import { ProgressDots } from './progress-dots'

export interface OnboardingShellProps {
  title: string
  subtitle: ReactNode
  stepIndex: number
  totalSteps: number
  children: ReactNode
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
        <ProgressDots current={stepIndex} total={totalSteps} />

        <div className="mb-6 text-center">
          <h1 className="mb-1 text-lg font-bold text-[#FDF9E4]">{title}</h1>
          <p className="text-sm text-[#6B7A8E]">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
