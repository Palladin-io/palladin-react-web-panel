import { useTranslation } from 'react-i18next'
import { useApproverKeyPresentation, useCanReviewSubmissions } from '../use-approver-keys'
import { RebootstrapPrompt } from './approver-key-notice'

const STATUS_KEY = {
  loading: 'submissions.keys.loading',
  settingUp: 'submissions.keys.settingUp',
  ready: 'submissions.keys.ready',
  waiting: 'submissions.keys.waiting',
  error: 'submissions.keys.error',
  unavailable: 'submissions.keys.unavailable',
} as const

/** Compact Settings → Security status of the caller's Agent submission review key. */
export function ApproverKeySection() {
  const { t } = useTranslation()
  const canReview = useCanReviewSubmissions()
  const presentation = useApproverKeyPresentation()
  if (!canReview) return null
  return (
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
      <h2 className="text-heading-sm font-bold text-[var(--cv-t1)]">{t('submissions.keys.title')}</h2>
      <p className="mt-1 text-ui text-[var(--cv-t3)]">{t('submissions.keys.description')}</p>
      <p className="mt-3 text-ui text-[var(--cv-t3)]" role="status">{t(STATUS_KEY[presentation])}</p>
      {presentation === 'unavailable' && (
        <div className="mt-3">
          <RebootstrapPrompt footerClassName="mt-4 flex justify-end border-t border-[var(--cv-divider)] pt-4" />
        </div>
      )}
    </section>
  )
}
