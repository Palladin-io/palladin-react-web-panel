import { useTranslation } from 'react-i18next'

interface AppWordmarkProps {
  /** 'sm' for sidebar header (logo 48px, "Palladin" 16px below, centred) — 'lg' for login hero (logo 64px, text 28px) */
  size?: 'sm' | 'lg'
}

/**
 * Palladin logotype: logo image + single-colour wordmark.
 * Used on the login page (lg) and in the app sidebar (sm).
 */
export function AppWordmark({ size = 'sm' }: AppWordmarkProps) {
  const { t } = useTranslation()
  const appName = t('auth.appName')

  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-2">
        <img src="/logo.png" alt={appName} className="h-16 w-16" />
        <h1 className="text-[28px] font-extrabold tracking-tight text-[#FDF9E4]">
          Palladin
        </h1>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <img src="/logo.png" alt={appName} className="h-12 w-12" />
      <span
        className="text-[16px] font-extrabold text-[var(--cv-t1)]"
        style={{ letterSpacing: '-0.01em' }}
      >
        Palladin
      </span>
    </div>
  )
}
