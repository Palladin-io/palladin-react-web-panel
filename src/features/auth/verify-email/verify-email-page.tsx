import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { Loader2, XCircle } from 'lucide-react'
import { AuthStepShell } from '../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../../shared/api/account-api'
import { clearPushTokenOnLogout } from '../../notifications'
import { getIsAuthenticated, useAuthStore } from '../stores/auth-store'
import { useAuthenticatedQueryKey } from '../session/authenticated-query-key'
import { useResendVerification } from '../hooks/use-resend-verification'
import { useVerifyEmail } from '../hooks/use-verify-email'
import {
  captureAuthenticatedSession,
  markEmailVerifiedForSession,
  terminateAuthenticatedSession,
} from '../session/session-boundary'

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
  const accountQueryKey = useAuthenticatedQueryKey(ACCOUNT_QUERY_KEY)
  const account = useQuery({
    queryKey: accountQueryKey,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })
  const { resend, isPending, isSuccess, cooldown } = useResendVerification()

  // If the account turns out to be verified after all (e.g. verified in another
  // tab), sync the persisted store BEFORE leaving. Skipping this deadlocks the
  // user: the router's `beforeLoad` fast path reads the (stale `false`) store,
  // redirects back here, the query still says verified, we navigate away again —
  // an infinite loop whose deps never change, stranding a verified account on
  // the gate. `markEmailVerified()` clears the stale flag so `beforeLoad` lets
  // them through.
  useEffect(() => {
    if (account.data?.emailVerified === true) {
      if (markEmailVerifiedForSession(captureAuthenticatedSession())) {
        navigate({ to: '/' })
      }
    }
  }, [account.data?.emailVerified, navigate])

  const handleLogout = async () => {
    const session = captureAuthenticatedSession()
    void clearPushTokenOnLogout(session)
    if (await terminateAuthenticatedSession(session)) {
      navigate({ to: '/login' })
    }
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
      align="center"
      logoAlt={t('auth.appName')}
      title={t('verifyEmail.pendingTitle')}
      subtitle={t('verifyEmail.pendingSubtitle')}
    >
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-ui text-[#B8C5D4]">
          {account.data?.email ? (
            <Trans i18nKey="verifyEmail.pendingBody" values={{ email: account.data.email }} />
          ) : (
            <Trans i18nKey="verifyEmail.pendingBodyNoEmail" />
          )}
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
  const emailVerified = useAuthStore((s) => s.emailVerified)

  const verifyToken = verify.mutate
  useEffect(() => {
    if (!token) return

    const timeoutId = window.setTimeout(() => verifyToken(token), 0)
    return () => window.clearTimeout(timeoutId)
  }, [token, verifyToken])

  const rawOutcome =
    !token ? 'invalid' : verify.isPending || verify.isIdle ? 'pending' : verify.data
  // A double-fire (StrictMode / a remount) consumes the token on the first call
  // and gets "token invalid" on the second — but the first success already
  // flipped this session's emailVerified flag. Trust it: the address IS verified,
  // so don't strand the user on an error/spinner for a token we ourselves used.
  const outcome =
    rawOutcome !== 'verified' && authenticated && emailVerified ? 'verified' : rawOutcome

  // Auto-forward once verified — the user shouldn't have to click through. An
  // authenticated session lands on /unlock (via the vault-lock guard) after a
  // brief "verified" confirmation; an anonymous one goes to /login.
  useEffect(() => {
    if (outcome !== 'verified') return
    const id = window.setTimeout(
      () => navigate({ to: authenticated ? '/' : '/login' }),
      1500,
    )
    return () => window.clearTimeout(id)
  }, [outcome, authenticated, navigate])

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
        align="center"
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
        align="center"
        logoAlt={t('auth.appName')}
        title={t('verifyEmail.successTitle')}
        subtitle={t('verifyEmail.successSubtitle')}
      >
        <div className="flex flex-col items-center gap-4">
          <p className="text-heading-md font-bold text-[var(--cv-success)]">
            {t('verifyEmail.verified')}
          </p>
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
      align="center"
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
