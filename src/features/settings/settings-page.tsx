import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { ExportDialog, useVaults } from '../vaults'
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

          <DataExportSection />
        </div>
      </div>
    </div>
  )
}

/** Export every vault's entries to a downloadable plaintext file. */
function DataExportSection() {
  const { t } = useTranslation()
  const vaults = useVaults()
  const [exportOpen, setExportOpen] = useState(false)

  const targets = (vaults.data?.vaults ?? []).map((v) => ({ id: v.id, name: v.name }))

  return (
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
      <h2 className="text-[13px] font-bold text-[var(--cv-t1)]">
        {t('settings.export.title')}
      </h2>
      <p className="mt-1 text-[12px] text-[var(--cv-t3)]">
        {t('settings.export.subtitle')}
      </p>
      <div className="mt-3">
        <Button
          variant="subtle"
          size="sm"
          icon="file_download"
          onClick={() => setExportOpen(true)}
          disabled={targets.length === 0}
        >
          {t('settings.export.cta')}
        </Button>
      </div>
      <ExportDialog
        open={exportOpen}
        vaults={targets}
        onClose={() => setExportOpen(false)}
      />
    </section>
  )
}
