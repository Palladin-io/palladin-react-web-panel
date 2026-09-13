import { SettingsSectionPage } from '../../shared/components/settings-section-page'
import { ConsentChoices } from './consent-choices'

export function PrivacySettingsPage() {
  return <SettingsSectionPage>
    <ConsentChoices source="web_settings" />
  </SettingsSectionPage>
}
