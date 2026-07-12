import { useTranslation } from 'react-i18next'
import { ChangeMasterPasswordSection } from './components/change-master-password-section'
import { TotpSection } from './components/totp-section'

/**
 * Account security screen: master-password change (CVT-268) and two-factor
 * authentication (CVT-269). Left-aligned, matching the settings page layout.
 * Inherits the theme-aware gradient + text colour from `_authenticated.tsx`.
 */
export function SecurityPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="mx-auto max-w-[51.25rem] px-6 py-8">
        <header className="mb-6">
          <h1 className="text-[20px] font-bold leading-tight text-[var(--cv-t1)]">
            {t('security.title')}
          </h1>
          <p className="mt-1 text-[12px] text-[var(--cv-t3)]">{t('security.subtitle')}</p>
        </header>

        <div className="flex flex-col gap-4">
          <TotpSection />
          <ChangeMasterPasswordSection />
        </div>
      </div>
    </div>
  )
}
