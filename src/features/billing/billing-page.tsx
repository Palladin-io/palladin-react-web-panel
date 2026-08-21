import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../shared/components/empty-state'
import { SettingsSectionPage } from '../../shared/components/settings-section-page'

export function BillingPage() {
  const { t } = useTranslation()
  return (
    <SettingsSectionPage title={t('settings.billing.title')} subtitle={t('settings.billing.subtitle')}>
      <EmptyState
        icon="credit_card"
        title={t('settings.billing.comingSoonTitle')}
        description={t('settings.billing.comingSoonBody')}
      />
    </SettingsSectionPage>
  )
}
