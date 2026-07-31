import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { Button } from '../../../../shared/components/button'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../../shared/api/account-api'
import { TotpEnrollmentDialog } from './totp-enrollment-dialog'
import { TotpDisableDialog } from './totp-disable-dialog'

/**
 * Two-factor authentication management. Reflects the account's
 * `totpEnabled` state and opens the enroll or disable flow. An undefined
 * `totpEnabled` (older backend) reads as disabled.
 */
export function TotpSection() {
  const { t } = useTranslation()
  const account = useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  const enabled = account.data?.totpEnabled === true

  return (
    <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-heading-sm font-bold text-[var(--cv-t1)]">
            {t('security.totp.title')}
          </h2>
          <p className="mt-1 text-ui text-[var(--cv-t3)]">{t('security.totp.subtitle')}</p>
        </div>
        <span
          className={
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-meta font-semibold ' +
            (enabled
              ? 'bg-[rgb(var(--cv-success-rgb)/0.12)] text-[var(--cv-success)]'
              : 'bg-[var(--cv-btn-subtle-bg)] text-[var(--cv-t3)]')
          }
        >
          {enabled ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
          {enabled ? t('security.totp.statusOn') : t('security.totp.statusOff')}
        </span>
      </div>

      <div className="mt-4">
        {enabled ? (
          <Button variant="danger" size="sm" onClick={() => setDisableOpen(true)}>
            {t('security.totp.disable')}
          </Button>
        ) : (
          <Button variant="accent" size="sm" onClick={() => setEnrollOpen(true)}>
            {t('security.totp.enable')}
          </Button>
        )}
      </div>

      {/* Conditionally mounted so each open starts from fresh dialog state. */}
      {enrollOpen && (
        <TotpEnrollmentDialog open onClose={() => setEnrollOpen(false)} />
      )}
      {disableOpen && (
        <TotpDisableDialog open onClose={() => setDisableOpen(false)} />
      )}
    </section>
  )
}
