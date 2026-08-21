import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { ExportDialog, useVaults } from '../vaults'
import { SettingsSectionPage } from '../../shared/components/settings-section-page'

export function DataExportPage() {
  const { t } = useTranslation()
  const vaults = useVaults()
  const [exportOpen, setExportOpen] = useState(false)
  const targets = (vaults.data?.vaults ?? []).map((vault) => ({ id: vault.id, name: vault.name }))

  return (
    <SettingsSectionPage title={t('settings.export.title')} subtitle={t('settings.export.pageSubtitle')}>
      <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
        <h2 className="text-heading-sm font-bold">{t('settings.export.cardTitle')}</h2>
        <p className="mt-1 text-ui text-[var(--cv-t3)]">{t('settings.export.subtitle')}</p>
        {vaults.isPending ? (
          <div className="mt-3"><SkeletonBlock height="2.5rem" /></div>
        ) : vaults.isError ? (
          <div className="mt-3">
            <ErrorState message={t('settings.export.errorLoad')} onRetry={vaults.refetch} />
          </div>
        ) : targets.length === 0 ? (
          <p className="mt-3 text-meta text-[var(--cv-t3)]">{t('settings.export.empty')}</p>
        ) : (
          <div className="mt-3">
            <Button
              variant="subtle"
              size="sm"
              icon="file_download"
              onClick={() => setExportOpen(true)}
            >
              {t('settings.export.cta')}
            </Button>
          </div>
        )}
      </section>
      <ExportDialog open={exportOpen} vaults={targets} onClose={() => setExportOpen(false)} />
    </SettingsSectionPage>
  )
}
