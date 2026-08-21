import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../shared/components/error-state'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { useAuthStore } from '../auth'
import { PERMISSION_ORGANIZATION_MANAGEMENT } from '../../shared/lib/permissions'
import { OrgSettingsForm } from './components/org-settings-form'
import { SettingsSectionPage } from '../../shared/components/settings-section-page'
import { useOrg } from './use-org'

/** General settings section for the organization profile. */
export function SettingsPage() {
  const { t } = useTranslation()
  const org = useOrg()
  const permissions = useAuthStore((state) => state.permissions)
  const canEdit = (permissions & PERMISSION_ORGANIZATION_MANAGEMENT) !== 0

  return (
    <SettingsSectionPage
      title={t('settings.general.title')}
      subtitle={t('settings.general.subtitle')}
    >
      {org.isPending ? (
        <SkeletonBlock height="10rem" />
      ) : org.isError || !org.data ? (
        <ErrorState message={t('settings.org.errorLoad')} onRetry={org.refetch} />
      ) : (
        <OrgSettingsForm key={org.data.orgId} org={org.data} canEdit={canEdit} />
      )}
    </SettingsSectionPage>
  )
}
