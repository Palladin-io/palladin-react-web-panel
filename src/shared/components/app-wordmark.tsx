import { useTranslation } from 'react-i18next'

interface AppWordmarkProps {
  /** 'sm' for sidebar (logo 20px, text 15px semibold) — 'lg' for login hero (logo 64px, text 28px extrabold, stacked) */
  size?: 'sm' | 'lg'
}

/**
 * Claw Vault logotype: logo image + two-colour wordmark.
 * "Claw " renders in cream, "Vault" in brand red.
 * Used on the login page (lg) and in the app sidebar (sm).
 */
export function AppWordmark({ size = 'sm' }: AppWordmarkProps) {
  const { t } = useTranslation()
  const appName = t('auth.appName')

  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-2">
        <img src="/logo.png" alt={appName} className="h-16 w-16" />
        <h1 className="text-[28px] font-extrabold tracking-tight">
          <span className="text-[#FDF9E4]">{t('auth.titleClaw')}</span>
          <span className="text-[#FF4F4F]">{t('auth.titleVault')}</span>
        </h1>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3.5">
      <img src="/logo.png" alt={appName} className="h-9 w-9 shrink-0" />
      <span
        className="text-[16px] font-extrabold"
        style={{ letterSpacing: '-0.01em' }}
      >
        <span className="text-[var(--cv-t1)]">Claw </span>
        <span className="text-[#FF4F4F]">Vault</span>
      </span>
    </div>
  )
}
