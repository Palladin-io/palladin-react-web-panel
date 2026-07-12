import { useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react'
import { AuthStepShell } from '../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../shared/api/account-api'
import { clearPushTokenOnLogout } from '../../notifications'
import { getIsAuthenticated, useAuthStore } from '../stores/auth-store'
import { useResendVerification } from '../hooks/use-resend-verification'
import { useVerifyEmail } from '../hooks/use-verify-email'

export interface VerifyEmailPageProps {
  /** The verification token from the `?token=` query param. */
  token?: string
}

/**
 * The `/verify-email` route has two jobs:
 *
 *  - **With `?token=`** — the result screen for a clicked verification link
 *    (verifying / verified / expired / invalid). Anonymous-friendly: the link
 *    may be opened in a browser with no session.
 *  - **Without a token, while signed in** — the hard-gate landing screen. The
 *    router redirects an unverified password account here and it can reach
 *    nothing else until it verifies: "we emailed you a link", a throttled
 *    resend, and logout.
 */
export function VerifyEmailPage({ token }: VerifyEmailPageProps) {
  const authenticated = getIsAuthenticated()

  if (!token && authenticated) {
    return <VerifyEmailGate />
  }
  return <VerifyEmailResult token={token} authenticated={authenticated} />
}

/** Hard-gate landing: the signed-in but unverified account can only wait, resend, or log out. */
function VerifyEmailGate() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const account = useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })
  const { resend, isPending, isSuccess, cooldown } = useResendVerification()

  // If the account turns out to be verified after all (e.g. verified in another
  // tab), leave the gate.
  useEffect(() => {
    if (account.data?.emailVerified === true) navigate({ to: '/' })
  }, [account.data?.emailVerified, navigate])

  const handleLogout = () => {
    void clearPushTokenOnLogout()
    useAuthStore.getState().logout()
    navigate({ to: '/login' })
  }

  const resendLabel = isPending
    ? t('verifyEmail.sending')
    : cooldown > 0
      ? t('verifyEmail.resendIn', { seconds: cooldown })
      : isSuccess
        ? t('verifyEmail.sent')
        : t('verifyEmail.resend')

  return (
    <AuthStepShell
      showLogo
      logoAlt={t('auth.appName')}
      title={t('verifyEmail.pendingTitle')}
      subtitle={t('verifyEmail.pendingSubtitle')}
    >
      <div className="flex flex-col items-center gap-4">
        <MailCheck className="h-10 w-10 text-[var(--cv-premium)]" />

        <p className="text-center text-ui text-[#B8C5D4]">
          {account.data?.email
            ? t('verifyEmail.pendingBody', { email: account.data.email })
            : t('verifyEmail.pendingBodyNoEmail')}
        </p>

        <AuthSubmitButton
          type="button"
          onClick={resend}
          disabled={isPending || cooldown > 0}
        >
          {resendLabel}
        </AuthSubmitButton>

        <button
          type="button"
          onClick={handleLogout}
          className="text-ui text-[#6B7A8E] transition-colors hover:text-[#E8EAED]"
        >
          {t('common.logout')}
        </button>
      </div>
    </AuthStepShell>
  )
}

interface VerifyEmailResultProps {
  token?: string
  authenticated: boolean
}

/** Result screen for a clicked `?token=` verification link. */
function VerifyEmailResult({ token, authenticated }: VerifyEmailResultProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const verify = useVerifyEmail()

  // Fire exactly once for a given token, even under StrictMode double-mount.
  const attempted = useRef(false)
  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    verify.mutate(token)
  }, [token, verify])

  const outcome = !token ? 'invalid' : verify.isPending || verify.isIdle ? 'pending' : verify.data

  const forwardAction = authenticated ? (
    <AuthSubmitButton type="button" onClick={() => navigate({ to: '/' })}>
      {t('verifyEmail.goToApp')}
    </AuthSubmitButton>
  ) : (
    <Link to="/login" className="w-full">
      <AuthSubmitButton type="button" className="w-full">
        {t('verifyEmail.goToLogin')}
      </AuthSubmitButton>
    </Link>
  )

  if (outcome === 'pending') {
    return (
      <AuthStepShell
        showLogo
        logoAlt={t('auth.appName')}
        title={t('verifyEmail.verifyingTitle')}
        subtitle={t('verifyEmail.verifyingSubtitle')}
      >
        <div className="flex justify-center py-2">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--cv-primary)]" />
        </div>
      </AuthStepShell>
    )
  }

  if (outcome === 'verified') {
    return (
      <AuthStepShell
        showLogo
        logoAlt={t('auth.appName')}
        title={t('verifyEmail.successTitle')}
        subtitle={t('verifyEmail.successSubtitle')}
      >
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 className="h-10 w-10 text-[var(--cv-success)]" />
          {forwardAction}
        </div>
      </AuthStepShell>
    )
  }

  // expired | invalid
  const isExpired = outcome === 'expired'
  return (
    <AuthStepShell
      showLogo
      logoAlt={t('auth.appName')}
      title={isExpired ? t('verifyEmail.expiredTitle') : t('verifyEmail.invalidTitle')}
      subtitle={isExpired ? t('verifyEmail.expiredSubtitle') : t('verifyEmail.invalidSubtitle')}
    >
      <div className="flex flex-col items-center gap-4">
        <XCircle className="h-10 w-10 text-[var(--cv-primary)]" />
        {forwardAction}
      </div>
    </AuthStepShell>
  )
}
