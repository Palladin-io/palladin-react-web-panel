import { useTranslation } from 'react-i18next'
import { SettingsSectionPage } from '../../../shared/components/settings-section-page'
import { ChangeMasterPasswordSection } from './components/change-master-password-section'
import { TotpSection } from './components/totp-section'

/**
 * Account security screen: master-password change and two-factor
 * authentication. Left-aligned, matching the settings page layout.
 * Inherits the theme-aware gradient + text colour from `_authenticated.tsx`.
 */
export function SecurityPage() {
  const { t } = useTranslation()

  return (
    <SettingsSectionPage title={t('security.title')} subtitle={t('security.subtitle')}>
      {/* TODO(authentication-methods): Add per-method controls for password and linked OAuth providers. Disabling a method must require step-up authentication and the API must reject disabling the last active login method. */}
      <TotpSection />
      <ChangeMasterPasswordSection />
    </SettingsSectionPage>
  )
}
