import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { AppWordmark } from './app-wordmark'

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
  /** Full auth brand lockup with the login/unlock proportions. */
  showBrand?: boolean
  /** Alt text for the logo when shown. */
  logoAlt?: string
  /**
   * Vertical placement. `'top'` (default) keeps the tall register wizard biased
   * toward the top so it never overflows off-screen. `'center'` truly centers
   * short standalone screens (verify-email gate/result) in the viewport.
   */
  align?: 'top' | 'center'
}

/**
 * Shared chrome for standalone auth surfaces (register wizard, verify-email
 * result). It follows the persisted application theme and stays dependency-free
 * so any auth-adjacent feature can reuse it without importing a feature shell.
 */
export function AuthStepShell({
  title,
  subtitle,
  children,
  onBack,
  backLabel,
  progress,
  showLogo,
  showBrand,
  logoAlt,
  align = 'top',
}: AuthStepShellProps) {
  const placement =
    align === 'center'
      ? 'items-center justify-center py-8'
      : 'items-start justify-center pt-[max(2rem,calc(50vh-22.5rem))]'
  const Heading = showBrand ? 'h2' : 'h1'
  return (
    <div className={`auth-surface flex min-h-screen ${placement}`}>
      <div className="step-enter w-full max-w-[27.5rem] px-6 py-10">
        {(onBack || progress) && (
          <div className="relative mb-5 flex items-center justify-center">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-full
                  text-[var(--cv-auth-secondary)] transition-colors hover:bg-[var(--cv-bg-subtle)]
                  hover:text-[var(--cv-t1)]"
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
                        ? 'bg-[var(--cv-pending)]'
                        : index === progress.current
                          ? 'bg-[var(--cv-primary)]'
                          : 'bg-[var(--cv-auth-divider)]')
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {showBrand && <div className="auth-brand-header"><AppWordmark size="hero" /></div>}
        <div className="mb-6 text-center">
          {showLogo && (
            <img src="/logo.png" alt={logoAlt} className="mx-auto mb-4 h-16 w-16" />
          )}
          <Heading className="mb-1 text-auth-title font-bold leading-tight text-[var(--cv-t1)]">
            {title}
          </Heading>
          <p className="text-heading-sm text-[var(--cv-auth-muted)]">{subtitle}</p>
        </div>

        {children}
      </div>
    </div>
  )
}
