import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface AppWordmarkProps {
  /** Sidebar row, compact standalone mark, or landing-matched auth hero. */
  size?: 'sm' | 'lg' | 'hero'
  /** Optional line rendered under the wordmark text, beside the logo (sm only). */
  subtitle?: ReactNode
}

/**
 * Palladin logotype: logo image + single-colour wordmark.
 * Used on the login page (lg) and in the app sidebar (sm).
 */
export function AppWordmark({ size = 'sm', subtitle }: AppWordmarkProps) {
  const { t } = useTranslation()
  const appName = t('auth.appName')

  if (size === 'lg' || size === 'hero') {
    return (
      <div className={size === 'hero' ? 'auth-brand-lockup' : 'flex flex-col items-center gap-[16px]'}>
        <img src="/logo.png" alt={appName} className={size === 'hero' ? 'auth-brand-logo' : 'h-16 w-auto'} />
        <h1 className={size === 'hero' ? 'auth-brand-wordmark' : 'text-display font-extrabold tracking-tight'}>
          <span className="text-[var(--cv-t1)]">Palladin</span>
          <span className="text-[var(--cv-primary)]">.io</span>
        </h1>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt={appName} className="h-11 w-auto" />
      <div className="min-w-0">
        <span
          className="block text-page-title font-extrabold leading-tight"
          style={{ letterSpacing: '-0.01em' }}
        >
          <span className="text-[var(--cv-t1)]">Palladin</span>
          <span className="text-[var(--cv-primary)]">.io</span>
        </span>
        {subtitle}
      </div>
    </div>
  )
}
