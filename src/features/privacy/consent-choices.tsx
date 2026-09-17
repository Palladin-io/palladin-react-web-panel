import { useId, useState, type ReactNode } from 'react'
import { HTTPError } from 'ky'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ToggleSwitch } from '../../shared/components/toggle-switch'
import { ErrorState } from '../../shared/components/error-state'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { ModalShell } from '../../shared/components/modal-shell'
import { Icon } from '../../shared/components/icon'
import { DialogFooter } from '../../shared/components/dialog-footer'
import type { ConsentSource, ConsentPurpose, UserConsent, UpdateConsent } from '../../shared/api/consents-api'
import { analytics } from '../../shared/lib/analytics'
import { matchesCurrentAnalyticsActivation, setLocalAnalyticsActivation } from '../../shared/lib/local-analytics-consent'
import { PrivacyPolicyLink } from './privacy-policy-link'
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
    if (attempts.length === 0) { onContinue?.(); return }
    void persist(attempts)
  }

  const unavailable = rows.some(row => !row?.currentNotice)
  const noDecisionsAvailable = !saving && !query.isPending && (query.isError || rows.every(row => !row?.currentNotice && row?.status !== 'granted'))
  const actions = <DialogFooter>
    {noDecisionsAvailable ? <Button size="sm" variant="outline" className="flex-1" onClick={close}>{t('privacy.continue')}</Button> : <>
    <Button size="sm" variant="outline" className="flex-1" disabled={saving || query.isPending || query.isError || rows.every(row => !row?.currentNotice && row?.status !== 'granted')} onClick={() => save()}>{t('privacy.saveChoice')}</Button>
    <Button size="sm" variant="accent" className="flex-1" disabled={saving || query.isPending || query.isError || unavailable} onClick={() => save(true)}>{t(saving ? 'privacy.saving' : 'privacy.acceptAll')}</Button>
    </>}
  </DialogFooter>
  const content = <div>
    <p className="text-ui leading-relaxed text-[var(--cv-t3)]">{t('privacy.essentialSummary')}</p>
    <div className="mt-3 flex flex-col gap-3">
    {query.isPending ? <SkeletonBlock height="10rem" /> : query.isError ? <ErrorState message={t('privacy.loadError')} onRetry={() => { void query.refetch() }} /> : purposes.map((purpose, index) => {
      const consent = rows[index]
      const checked = consent ? granted(consent) : false
      const locallyActive = matchesCurrentAnalyticsActivation(consent, activation)
      return <ConsentCard key={purpose} purpose={purpose} consent={consent} checked={checked}
        disabled={saving || !consent || (!consent.currentNotice && !checked)}
        onChange={value => { if (consent) change(consent, value) }}>
        {source === 'web_settings' && purpose === 'product_analytics' && <div className="mt-3">
          <p role="status" className="text-meta text-[var(--cv-t2)]">{t(locallyActive ? 'privacy.activeHere' : 'privacy.inactiveHere')}</p>
          {consent?.status === 'granted' && checked && !locallyActive && consent.currentNotice && <Button size="sm" variant="subtle" className="mt-2" disabled={saving} onClick={() => save(false, true)}>{t('privacy.activateHere')}</Button>}
        </div>}
      </ConsentCard>
    })}
    </div>
    <p className="-mb-2 pt-3 text-micro leading-relaxed text-[var(--cv-t3)]">{t('privacy.subtitle')}</p>
    {unavailable && !query.isPending && !query.isError && <p role="status" className="mt-4 text-meta text-[var(--cv-t2)]">{t('privacy.noticeUnavailable')}</p>}
    {!saving && decisionError && <p role="alert" className="text-ui text-[var(--cv-danger)]">{t(`privacy.${decisionError}`)}</p>}
    {!saving && pending.length > 0 && <div role="alert"><p className="mb-2 text-ui text-[var(--cv-danger)]">{t('privacy.saveError')}</p><Button size="sm" variant="subtle" onClick={() => { void persist(pending) }}>{t('privacy.retry')}</Button></div>}
  </div>
  return <ModalShell title={t('privacy.title')} ariaLabel={t('privacy.title')} trapFocus onClose={saving ? undefined : close} width={440} footer={actions}>{content}</ModalShell>
}

function ConsentCard({ purpose, consent, checked, disabled, onChange, children }: {
  purpose: ConsentPurpose
  consent?: UserConsent
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const title = t(`privacy.${purpose}`)
  return <section className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
    <div className="flex items-center justify-between gap-5">
      <div className="min-w-0">
        <h3 className="text-ui font-medium text-[var(--cv-t1)]">
          {consent?.currentNotice ? <button type="button" aria-expanded={expanded} aria-controls={detailsId}
            onClick={() => setExpanded(value => !value)}
            className="flex cursor-pointer items-center gap-1.5 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--cv-primary)]">
            {title}<Icon name="expand_more" size={14} className={`shrink-0 text-[var(--cv-t3)] transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
          </button> : title}
        </h3>
        <p className="mt-1 text-meta leading-relaxed text-[var(--cv-t3)]">{t(`privacy.${purpose}Description`)}</p>
      </div>
      <ToggleSwitch checked={checked} label={title} onChange={onChange} disabled={disabled} />
    </div>
    {children}
    {consent?.currentNotice && <div id={detailsId} aria-hidden={!expanded} inert={!expanded}
      className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
        <p className="whitespace-pre-line pt-3 text-meta leading-relaxed text-[var(--cv-t3)]">{consent.currentNotice.text}</p>
        <PrivacyPolicyLink />
      </div>
    </div>}
  </section>
}
