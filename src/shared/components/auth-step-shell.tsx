import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { AUTH_BACKGROUND_GRADIENT } from '../lib/styles'

export interface AuthStepShellProps {
  title: string
  subtitle: ReactNode
  children: ReactNode
  /** Optional back affordance (top-left chevron). */
  onBack?: () => void
  /** Accessible label for the back button. */
  backLabel?: string
  /** When provided, renders progress dots above the title. */
  progress?: { current: number; total: number }
  /** Render the app logo above the title (used on standalone screens). */
  showLogo?: boolean
  /** Alt text for the logo when shown. */
  logoAlt?: string
}

/**
 * Shared chrome for the standalone auth surfaces (register wizard, verify-email
 * result). A centred card on the same dark gradient the unlock/onboarding
 * screens use. Kept generic and dependency-free so any auth-adjacent feature
 * can reuse it without importing another feature's shell.
 *
 * `dark` is hardcoded on the root: these pages always render on a dark
 * gradient, so `--cv-*` tokens must resolve to their dark values regardless of
 * the user's app theme (see CLAUDE.md "Dark-Mode Forced Pages").
 */
export function AuthStepShell({
  title,
  subtitle,
  children,
  onBack,
  backLabel,
  progress,
  showLogo,
  logoAlt,
}: AuthStepShellProps) {
  return (
    <div
      className="dark flex min-h-screen items-start justify-center pt-[max(2rem,calc(50vh-22.5rem))]"
      style={{ background: AUTH_BACKGROUND_GRADIENT }}
    >
      <div className="step-enter w-full max-w-[27.5rem] px-6 py-10">
        {(onBack || progress) && (
          <div className="relative mb-5 flex items-center justify-center">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-full
                  text-[#B8C5D4] transition-colors hover:bg-[rgba(232,234,237,0.08)] hover:text-[#E8EAED]"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {progress && (
              <div
                className="flex justify-center gap-2"
                role="progressbar"
                aria-valuenow={progress.current + 1}
                aria-valuemin={1}
                aria-valuemax={progress.total}
              >
                {Array.from({ length: progress.total }, (_, index) => (
                  <span
                    key={index}
                    className={
                      'h-2 w-2 rounded-full transition-colors ' +
                      (index < progress.current
                        ? 'bg-[#FFAB87]'
                        : index === progress.current
                          ? 'bg-[var(--cv-primary)]'
                          : 'bg-[rgba(232,234,237,0.08)]')
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-6 text-center">
          {showLogo && (
            <img src="/logo.png" alt={logoAlt} className="mx-auto mb-4 h-16 w-16" />
          )}
          <h1 className="mb-1 text-auth-title font-bold leading-tight text-[#E8EAED]">
            {title}
          </h1>
          <p className="text-heading-sm text-[#6B7A8E]">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
