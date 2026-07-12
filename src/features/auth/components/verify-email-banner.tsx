import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MailWarning } from 'lucide-react'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../shared/api/account-api'
import { useResendVerification } from '../hooks/use-resend-verification'

/**
 * Soft, always-visible banner shown while a password account's email is
 * unverified. Server-authoritative: it reads the account query and renders only
 * when `emailVerified === false` (an unknown/undefined value — older backends,
 * OAuth accounts — never triggers it, so there are no false positives). The app
 * stays fully usable; the backend independently gates sensitive actions.
 */
export function VerifyEmailBanner() {
  const { t } = useTranslation()
  const account = useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })
  const { resend, isPending, isSuccess, cooldown } = useResendVerification()

  if (account.data?.emailVerified !== false) return null

  const resendLabel = isPending
    ? t('verifyEmail.banner.sending')
    : cooldown > 0
      ? t('verifyEmail.banner.resendIn', { seconds: cooldown })
      : isSuccess
        ? t('verifyEmail.banner.sent')
        : t('verifyEmail.banner.resend')

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[rgba(212,130,10,0.3)]
        bg-[rgba(212,130,10,0.08)] px-4 py-2.5 text-[11px] text-[var(--cv-t1)]
        dark:border-[rgba(240,192,64,0.25)] dark:bg-[rgba(240,192,64,0.1)]"
    >
      <MailWarning size={16} className="shrink-0 text-[#D4820A] dark:text-[#F0C040]" />
      <span className="flex-1">
        <span className="font-semibold">{t('verifyEmail.banner.title')}</span>{' '}
        <span className="text-[var(--cv-t2)]">
          {account.data?.email
            ? t('verifyEmail.banner.bodyWithEmail', { email: account.data.email })
            : t('verifyEmail.banner.body')}
        </span>
      </span>
      <button
        type="button"
        onClick={resend}
        disabled={isPending || cooldown > 0}
        className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#D4820A]
          transition-colors hover:bg-[rgba(212,130,10,0.12)] disabled:cursor-not-allowed
          disabled:opacity-60 dark:text-[#F0C040] dark:hover:bg-[rgba(240,192,64,0.14)]"
      >
        {resendLabel}
      </button>
    </div>
  )
}
