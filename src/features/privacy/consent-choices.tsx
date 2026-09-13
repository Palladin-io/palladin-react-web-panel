import { useState } from 'react'
import { HTTPError } from 'ky'
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
import { matchesCurrentAnalyticsActivation, setLocalAnalyticsActivation } from '../../shared/lib/local-analytics-consent'
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
  const [decisionError, setDecisionError] = useState<'revisionConflict' | 'saveRejected' | null>(null)
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
    setDecisionError(null)
    if (attempts.some(attempt => attempt.purpose === 'product_analytics' && attempt.decision.granted)) stopHere()
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
    } catch (error) {
      stopHere()
      const status = error instanceof HTTPError ? error.response.status : undefined
      if (status !== undefined && status < 500 && status !== 408 && status !== 429) {
        // The mutation hook awaited an authoritative refresh; a rejected write needs a new decision.
        setPending([])
        setDraft({})
        const message = status === 409 ? 'revisionConflict' : 'saveRejected'
        setDecisionError(message)
        toast.error(t(`privacy.${message}`))
      } else {
        setPending(remaining)
        toast.error(t('privacy.saveError'))
      }
    } finally { setSaving(false) }
  }

  function save(acceptAll = false, activateHere = false) {
    if (saving || query.isPending || query.isError || (acceptAll && unavailable)) return
    if (acceptAll) { stopHere(); setDraft({ product_analytics: true, email_marketing: true }) }
    // Confirm marketing first: the last confirmed analytics grant activates this
    // installation, including after retry of an unconfirmed partial save.
    const orderedRows = acceptAll || (rows[0] && granted(rows[0])) ? [...rows].reverse() : rows
    const attempts: Attempt[] = []
    for (const consent of orderedRows) {
      if (!consent) continue
      const selected = acceptAll || granted(consent)
      const activate = activateHere && consent.purpose === 'product_analytics'
      if (!acceptAll && !activate && selected === (consent.status === 'granted') && consent.status !== 'unknown') continue
      const version = consent.currentNotice?.version ?? consent.noticeVersion
      const locale = consent.currentNotice?.locale ?? consent.noticeLocale
      // An unavailable notice never becomes a fabricated consent or API decision.
      if (!version || !locale || (selected && !consent.currentNotice)) continue
      attempts.push({ purpose: consent.purpose, decision: {
        granted: selected, expectedRevision: consent.revision, requestId: crypto.randomUUID(),
        noticeVersion: version, locale, source,
      } })
    }
    if (attempts.length === 0) { if (!unavailable) onContinue?.(); return }
    void persist(attempts)
  }

  const unavailable = rows.some(row => !row?.currentNotice)
  const actions = <DialogFooter>
    <Button size="sm" variant="outline" className="flex-1" disabled={saving || query.isPending || query.isError || rows.every(row => !row?.currentNotice && row?.status !== 'granted')} onClick={() => save()}>{t('privacy.saveChoice')}</Button>
    <Button size="sm" variant="accent" className="flex-1" disabled={saving || query.isPending || query.isError || unavailable} onClick={() => save(true)}>{t(saving ? 'privacy.saving' : 'privacy.acceptAll')}</Button>
  </DialogFooter>
  const content = <div className="flex flex-col gap-4">
    <p className="text-ui text-[var(--cv-t2)]">{t('privacy.subtitle')}</p>
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
      const locallyActive = matchesCurrentAnalyticsActivation(consent, activation)
      return <section key={purpose} className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-heading-sm font-bold">{t(`privacy.${purpose}`)}</h3>
          <ToggleSwitch checked={checked} label={t(`privacy.${purpose}`)} onChange={value => { if (consent) change(consent, value) }} disabled={saving || !consent || (!consent.currentNotice && !checked)} />
        </div>
        <p className="mt-2 text-ui text-[var(--cv-t2)]">{t(`privacy.${purpose}Description`)}</p>
        {source === 'web_settings' && purpose === 'product_analytics' && <div className="mt-3">
          <p role="status" className="text-meta text-[var(--cv-t2)]">{t(locallyActive ? 'privacy.activeHere' : 'privacy.inactiveHere')}</p>
          {consent?.status === 'granted' && checked && !locallyActive && consent.currentNotice && <Button size="sm" variant="subtle" className="mt-2" disabled={saving} onClick={() => save(false, true)}>{t('privacy.activateHere')}</Button>}
        </div>}
        {consent?.currentNotice && <details className="mt-3 text-meta text-[var(--cv-t2)]"><summary>{t('privacy.details')}</summary><p className="mt-2 whitespace-pre-line">{consent.currentNotice.text}</p></details>}
      </section>
    })}
    {unavailable && !query.isPending && !query.isError && <p role="status" className="text-meta text-[var(--cv-t2)]">{t('privacy.noticeUnavailable')}</p>}
    {!saving && decisionError && <p role="alert" className="text-ui text-[var(--cv-error)]">{t(`privacy.${decisionError}`)}</p>}
    {!saving && pending.length > 0 && <div role="alert"><p className="mb-2 text-ui text-[var(--cv-error)]">{t('privacy.saveError')}</p><Button size="sm" variant="subtle" onClick={() => { void persist(pending) }}>{t('privacy.retry')}</Button></div>}
  </div>
  return <ModalShell title={t('privacy.onboardingTitle')} ariaLabel={t('privacy.onboardingTitle')} trapFocus onClose={saving ? undefined : close} width={480} footer={actions}>{content}</ModalShell>
}
