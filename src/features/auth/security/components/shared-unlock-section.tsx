import { useTranslation } from 'react-i18next'
import { Button } from '../../../../shared/components/button'
import { ToggleSwitch } from '../../../../shared/components/toggle-switch'
import { SharedUnlockApiError } from '../../shared-unlock/api'
import { useAuthStore } from '../../stores/auth-store'
import { useSharedUnlockPreference } from '../use-shared-unlock-preference'
import { SharedUnlockLinkSection } from './shared-unlock-link-section'

export function SharedUnlockSection() {
  const accountId = useAuthStore(state => state.userId)
  const generation = useAuthStore(state => state.cryptoSessionGeneration)
  return <SharedUnlockAccountSection key={`${accountId}:${generation}`} />
}

function SharedUnlockAccountSection() {
  const { t } = useTranslation()
  const { preference, save } = useSharedUnlockPreference()
  const current = preference.data
  const error = save.error ?? preference.error
  const conflict = error instanceof SharedUnlockApiError && error.code === 'conflict'
  const paused = current?.locallyPaused || save.isError
  const busy = preference.isPending || save.isPending

  return (
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-heading-sm font-bold text-[var(--cv-t1)]">{t('security.sharedUnlock.title')}</h2>
          <p className="mt-1 text-ui text-[var(--cv-t3)]">{t('security.sharedUnlock.description')}</p>
        </div>
        {current && <ToggleSwitch checked={current.sharedUnlockEnabled} label={t('security.sharedUnlock.title')}
          disabled={busy} onChange={enabled => save.mutate({ enabled, revision: current.revision })} />}
      </div>
      <p className="mt-3 text-ui text-[var(--cv-t3)]">{t('security.sharedUnlock.behavior')}</p>
      <p className="mt-3 text-ui text-[var(--cv-t3)]">{t('security.sharedUnlock.offEffect')}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cv-divider)] pt-4">
        <p className="text-ui text-[var(--cv-t3)]" role={error ? 'alert' : 'status'}>
          {save.isPending ? t('security.sharedUnlock.saving')
            : preference.isPending ? t('security.sharedUnlock.loading')
              : error ? t(conflict ? 'security.sharedUnlock.conflict' : paused ? 'security.sharedUnlock.saveFailed' : 'security.sharedUnlock.loadFailed')
                : paused ? t('security.sharedUnlock.paused')
                  : t(current?.sharedUnlockEnabled ? 'security.sharedUnlock.enabled' : 'security.sharedUnlock.disabled')}
        </p>
        {(error || paused) && <Button variant="subtle" size="sm" disabled={busy} onClick={() => {
          if (current && save.variables) save.mutate({ enabled: save.variables.enabled, revision: current.revision })
          else if (current && paused) save.mutate({ enabled: current.sharedUnlockEnabled, revision: current.revision })
          else void preference.refetch()
        }}>{t('security.sharedUnlock.retry')}</Button>}
      </div>
      <SharedUnlockLinkSection />
    </section>
  )
}
