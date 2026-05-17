import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../shared/components/error-state'
import { OrgSettingsForm } from './components/org-settings-form'
import { useOrg } from './use-org'

/**
 * Settings area for the organization profile (currently the org-name
 * form). API key management lives on its own `/api-keys` split-view
 * page. Inherits the theme-aware gradient + text colour from
 * `_authenticated.tsx` (mirroring the vault pages).
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const org = useOrg()

  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="mx-auto max-w-[820px] px-6 py-8">
        <header className="mb-6">
          <h1 className="text-[20px] font-bold leading-tight text-[var(--cv-t1)]">
            {t('settings.title')}
          </h1>
          <p className="mt-1 text-[12px] text-[var(--cv-t3)]">
            {t('settings.subtitle')}
          </p>
        </header>

        <div className="flex flex-col gap-4">
          {org.isPending ? (
            <div className="h-40 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
          ) : org.isError || !org.data ? (
            <ErrorState
              message={t('settings.org.errorLoad')}
              onRetry={org.refetch}
            />
          ) : (
            // Re-key on the org id so the form re-seeds from fresh props
            // if the org resource ever changes underneath us.
            <OrgSettingsForm key={org.data.orgId} org={org.data} />
          )}
        </div>
      </div>
    </div>
  )
}
