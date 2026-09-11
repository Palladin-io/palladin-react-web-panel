import { useTranslation } from 'react-i18next'
import { SettingsSectionPage } from '../../shared/components/settings-section-page'
import { ConsentChoices } from './consent-choices'

export function PrivacySettingsPage() {
  const { t } = useTranslation()
  return <SettingsSectionPage title={t('privacy.title')} subtitle={t('privacy.subtitle')}>
    <ConsentChoices source="web_settings" />
  </SettingsSectionPage>
}
