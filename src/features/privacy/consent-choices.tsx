import { useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ToggleSwitch } from '../../shared/components/toggle-switch'
import { ErrorState } from '../../shared/components/error-state'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import type { ConsentSource, UserConsent, UpdateConsent } from '../../shared/api/consents-api'
import { analytics } from '../../shared/lib/analytics'
import { setLocalAnalyticsActivation } from '../../shared/lib/local-analytics-consent'
import { useChangeConsent, useConsents, useLocalActivation } from './use-consents'

export function ConsentChoices({ source, onContinue }: { source: ConsentSource; onContinue?: () => void }) {
  const query = useConsents()
  const { t } = useTranslation()
  const saving = useIsMutating({ mutationKey: ['account-consent-decision'] }) > 0
  return (
    <div className="flex flex-col gap-4">
      {query.isPending ? <SkeletonBlock height="10rem" /> : query.isError ? (
        <ErrorState message={t('privacy.loadError')} onRetry={() => { void query.refetch() }} />
      ) : query.data?.consents.map(consent => (
        <ConsentChoice key={consent.purpose} consent={consent} userId={query.userId!} source={source} />
      ))}
      {onContinue && <Button size="sm" variant="subtle" disabled={saving} onClick={onContinue}>{t('privacy.continue')}</Button>}
    </div>
  )
}

function ConsentChoice({ consent, userId, source }: { consent: UserConsent; userId: string; source: ConsentSource }) {
  const { t } = useTranslation()
  const mutation = useChangeConsent()
  const activation = useLocalActivation(userId)
  const [attempt, setAttempt] = useState<UpdateConsent | null>(null)
  const analyticsPurpose = consent.purpose === 'product_analytics'
  const checked = consent.status === 'granted'
  const locallyActive = activation?.noticeVersion === consent.noticeVersion
    && activation?.activationRevision === consent.activationRevision

  function save(decision: UpdateConsent) {
    setAttempt(decision)
    mutation.mutate({ purpose: consent.purpose, decision }, {
      onSuccess: () => { setAttempt(null); toast.success(t('privacy.saved')) },
      onError: () => {
        if (analyticsPurpose) {
          analytics.reset()
          setLocalAnalyticsActivation(userId, null)
        }
        toast.error(t(analyticsPurpose ? 'privacy.saveError' : 'privacy.marketingSaveError'))
      },
    })
  }

  function choose(granted: boolean) {
    const version = consent.currentNotice?.version ?? consent.noticeVersion
    const locale = consent.currentNotice?.locale ?? consent.noticeLocale
    if (!version || !locale) return
    save({ granted, expectedRevision: consent.revision, requestId: crypto.randomUUID(),
      noticeVersion: version, locale, source })
  }

  return (
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-heading-sm font-bold">{t(`privacy.${consent.purpose}`)}</h2>
        <ToggleSwitch checked={checked} label={t(`privacy.${consent.purpose}`)} onChange={choose}
          disabled={mutation.isPending || (!consent.currentNotice && consent.status !== 'granted')} />
      </div>
      <p className="mt-2 whitespace-pre-line text-ui text-[var(--cv-t2)]">
        {consent.currentNotice?.text ?? t('privacy.noticeUnavailable')}
      </p>
      {analyticsPurpose && <p className="mt-2 text-meta text-[var(--cv-t3)]">{t('privacy.localActivation')}</p>}
      {analyticsPurpose && checked && !locallyActive && consent.currentNotice && <div className="mt-3">
        <Button size="sm" variant="subtle" disabled={mutation.isPending} onClick={() => choose(true)}>{t('privacy.activateHere')}</Button>
      </div>}
      <p role="status" className="mt-3 text-meta text-[var(--cv-t3)]">
        {mutation.isPending ? t('privacy.saving') : t(`privacy.status.${consent.status}`)}
      </p>
      {mutation.isError && attempt && <div className="mt-3">
        <p role="alert" className="mb-2 text-meta text-[var(--cv-error)]">{t(analyticsPurpose ? 'privacy.saveError' : 'privacy.marketingSaveError')}</p>
        <Button size="sm" variant="subtle" onClick={() => save(attempt)}>{t('privacy.retry')}</Button>
      </div>}
    </section>
  )
}
