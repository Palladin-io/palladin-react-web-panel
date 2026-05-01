import { useTranslation } from 'react-i18next'
import { Icon } from './icon'

interface AppWordmarkProps {
  /** 'sm' for sidebar (icon 20px, text 15px semibold) — 'lg' for login hero (icon 28px, text 28px extrabold) */
  size?: 'sm' | 'lg'
}

/**
 * Claw Vault logotype: shield icon + two-colour wordmark.
 * "Claw " renders in cream, "Vault" in brand red — consistent
 * across the login page and the app sidebar.
 */
export function AppWordmark({ size = 'sm' }: AppWordmarkProps) {
  const { t } = useTranslation()

  if (size === 'lg') {
    return (
      <div className="flex items-center justify-center gap-3">
        <Icon name="shield_lock" size={28} color="#FF4F4F" />
        <span className="text-[28px] font-extrabold tracking-tight">
          <span className="text-[#FDF9E4]">{t('auth.titleClaw')}</span>
          <span className="text-[#FF4F4F]">{t('auth.titleVault')}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Icon name="shield_lock" size={20} color="#FF4F4F" />
      <span className="text-[15px] font-semibold tracking-wide">
        <span className="text-[#FDF9E4]">{t('auth.titleClaw')}</span>
        <span className="text-[#FF4F4F]">{t('auth.titleVault')}</span>
      </span>
    </div>
  )
}
