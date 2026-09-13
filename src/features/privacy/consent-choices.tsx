import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ToggleSwitch } from '../../shared/components/toggle-switch'
import { ErrorState } from '../../shared/components/error-state'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { ModalShell } from '../../shared/components/modal-shell'
import { DialogFooter } from '../../shared/components/dialog-footer'
import type { ConsentSource, ConsentPurpose, UserConsent, UpdateConsent } from '../../shared/api/consents-api'
import { analytics } from '../../shared/lib/analytics'
import { setLocalAnalyticsActivation } from '../../shared/lib/local-analytics-consent'
import { useChangeConsent, useConsents, useLocalActivation } from './use-consents'

const purposes: ConsentPurpose[] = ['product_analytics', 'email_marketing']
interface Attempt { purpose: ConsentPurpose; decision: UpdateConsent }

export function ConsentChoices({ source, onContinue }: { source: ConsentSource; onContinue?: () => void }) {
  const query = useConsents()
  // A different account, language or notice starts a new form, never carrying a draft grant.
  const key = [query.userId, query.locale, ...purposes.map(p => query.data?.consents.find(c => c.purpose === p)?.currentNotice?.version)].join(':')
  return <ConsentForm key={key} source={source} onContinue={onContinue} />
}

function ConsentForm({ source, onContinue }: { source: ConsentSource; onContinue?: () => void }) {
  const query = useConsents()
  const { t } = useTranslation()
  const mutation = useChangeConsent()
  const activation = useLocalActivation(query.userId)
  const [draft, setDraft] = useState<Partial<Record<ConsentPurpose, boolean>>>({})
  const [pending, setPending] = useState<Attempt[]>([])
  const [saving, setSaving] = useState(false)
  const rows = purposes.map(purpose => query.data?.consents.find(c => c.purpose === purpose))
  const granted = (consent: UserConsent) => draft[consent.purpose] ?? (consent.status === 'granted')
  const stopHere = () => {
    analytics.reset()
    if (query.userId) setLocalAnalyticsActivation(query.userId, null)
  }
  const close = () => { stopHere(); onContinue?.() }

  function change(consent: UserConsent, value: boolean) {
    if (consent.purpose === 'product_analytics' && !value) stopHere()
    setPending([])
    setDraft(previous => ({ ...previous, [consent.purpose]: value }))
  }

  async function persist(attempts: Attempt[]) {
    setSaving(true)
    setPending(attempts)
    let remaining = attempts
    try {
      for (const attempt of attempts) {
        await mutation.mutateAsync(attempt)
        remaining = remaining.slice(1)
        setPending(remaining)
      }
      setDraft({})
      toast.success(t('privacy.saved'))
      onContinue?.()
    } catch {
      // Partial saves are visible. Retry only the unconfirmed, idempotent remainder.
      stopHere()
      setPending(remaining)
      toast.error(t('privacy.saveError'))
    } finally { setSaving(false) }
  }

  function save(essentialOnly = false, activateHere = false) {
    if (essentialOnly) { stopHere(); setDraft({ product_analytics: false, email_marketing: false }) }
    const attempts: Attempt[] = []
    for (const consent of rows) {
      if (!consent) continue
      const selected = essentialOnly ? false : granted(consent)
      const activate = activateHere && consent.purpose === 'product_analytics'
      if (!activate && selected === (consent.status === 'granted') && consent.status !== 'unknown') continue
      const version = consent.currentNotice?.version ?? consent.noticeVersion
      const locale = consent.currentNotice?.locale ?? consent.noticeLocale
      // An unavailable notice never becomes a fabricated consent or API decision.
      if (!version || !locale || (selected && !consent.currentNotice)) continue
      attempts.push({ purpose: consent.purpose, decision: {
        granted: selected, expectedRevision: consent.revision, requestId: crypto.randomUUID(),
        noticeVersion: version, locale, source,
      } })
    }
    if (attempts.length === 0) { if (essentialOnly) onContinue?.(); return }
    void persist(attempts)
  }

  const unavailable = rows.some(row => !row?.currentNotice)
  const actions = <DialogFooter>
    <Button size="sm" variant="subtle" className="flex-1" disabled={saving} onClick={() => save(true)}>{t('privacy.essentialOnly')}</Button>
    <Button size="sm" variant="subtle" className="flex-1" disabled={saving || query.isPending || query.isError || rows.every(row => !row?.currentNotice && row?.status !== 'granted')} onClick={() => save()}>{t(saving ? 'privacy.saving' : 'privacy.saveChoice')}</Button>
  </DialogFooter>
  const content = <div className="flex flex-col gap-4">
    {onContinue && <p className="text-ui text-[var(--cv-t2)]">{t('privacy.subtitle')}</p>}
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-heading-sm font-bold">{t('privacy.essential')}</h3>
        <span className="text-meta text-[var(--cv-t2)]">{t('privacy.alwaysActive')}</span>
      </div>
      <p className="mt-2 text-ui text-[var(--cv-t2)]">{t('privacy.essentialDescription')}</p>
    </section>
    {query.isPending ? <SkeletonBlock height="10rem" /> : query.isError ? <ErrorState message={t('privacy.loadError')} onRetry={() => { void query.refetch() }} /> : purposes.map((purpose, index) => {
      const consent = rows[index]
      const checked = consent ? granted(consent) : false
      const locallyActive = consent?.status === 'granted' && activation?.noticeVersion === consent.noticeVersion && activation?.activationRevision === consent.activationRevision
      return <section key={purpose} className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-heading-sm font-bold">{t(`privacy.${purpose}`)}</h3>
          <ToggleSwitch checked={checked} label={t(`privacy.${purpose}`)} onChange={value => { if (consent) change(consent, value) }} disabled={saving || !consent || (!consent.currentNotice && !checked)} />
        </div>
        <p className="mt-2 text-ui text-[var(--cv-t2)]">{t(`privacy.${purpose}Description`)}</p>
        {!onContinue && purpose === 'product_analytics' && <div className="mt-3">
          <p role="status" className="text-meta text-[var(--cv-t2)]">{t(locallyActive ? 'privacy.activeHere' : 'privacy.inactiveHere')}</p>
          {consent?.status === 'granted' && checked && !locallyActive && consent.currentNotice && <Button size="sm" variant="subtle" className="mt-2" disabled={saving} onClick={() => save(false, true)}>{t('privacy.activateHere')}</Button>}
        </div>}
        {!onContinue && consent && <p className="mt-2 text-meta text-[var(--cv-t3)]">{t(`privacy.status.${consent.status}`)}</p>}
        {consent?.currentNotice && <details className="mt-3 text-meta text-[var(--cv-t2)]"><summary>{t('privacy.details')}</summary><p className="mt-2 whitespace-pre-line">{consent.currentNotice.text}</p></details>}
      </section>
    })}
    {unavailable && !query.isPending && !query.isError && <p role="status" className="text-meta text-[var(--cv-t2)]">{t('privacy.noticeUnavailable')}</p>}
    {!saving && pending.length > 0 && <div role="alert"><p className="mb-2 text-ui text-[var(--cv-error)]">{t('privacy.saveError')}</p><Button size="sm" variant="subtle" onClick={() => { void persist(pending) }}>{t('privacy.retry')}</Button></div>}
  </div>
  return onContinue ? <ModalShell title={t('privacy.onboardingTitle')} ariaLabel={t('privacy.onboardingTitle')} trapFocus onClose={saving ? undefined : close} width={560} footer={actions}>{content}</ModalShell>
    : <div className="flex max-w-3xl flex-col gap-4">{content}{actions}</div>
}
