import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Trans, useTranslation } from 'react-i18next'
import { Loader2, XCircle } from 'lucide-react'
import { AuthStepShell } from '../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { ErrorState } from '../../../shared/components/error-state'
import { clearPushTokenOnLogout } from '../../notifications'
import { getIsAuthenticated, useAuthStore } from '../stores/auth-store'
import { logoutAndReload } from '../session/client-session'
import { useResendVerification } from '../hooks/use-resend-verification'
import { useVerifyEmail } from '../hooks/use-verify-email'
import { useVerificationGate } from '../hooks/use-verification-gate'
import { parseAuthRedirect } from '../../../shared/lib/auth-redirect'

export interface VerifyEmailPageProps {
  /** The verification token from the `?token=` query param. */
  token?: string
  redirectTo?: string
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
export function VerifyEmailPage({ token, redirectTo }: VerifyEmailPageProps) {
  const authenticated = getIsAuthenticated()

  if (!token && authenticated) {
    return <VerifyEmailGate redirectTo={parseAuthRedirect(redirectTo)} />
  }
  return <VerifyEmailResult token={token} authenticated={authenticated} redirectTo={parseAuthRedirect(redirectTo)} />
}

/** Hard-gate landing: the signed-in but unverified account can only wait, resend, or log out. */
function VerifyEmailGate({ redirectTo }: { redirectTo?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const verification = useVerificationGate()
  const account = verification.data?.account
  const { resend, isPending, isSuccess, cooldown } = useResendVerification()

  useEffect(() => {
    if (verification.data?.ready) {
      if (redirectTo) void navigate({ href: redirectTo })
      else void navigate({ to: '/' })
    }
  }, [verification.data?.ready, navigate, redirectTo])

  const handleLogout = () => {
    void logoutAndReload('/login', clearPushTokenOnLogout)
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
      showBrand
      align="center"
      title={t('verifyEmail.pendingTitle')}
      subtitle={t('verifyEmail.pendingSubtitle')}
    >
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-meta text-[var(--cv-auth-secondary)]">
          {account?.email ? (
            <Trans i18nKey="verifyEmail.pendingBody" values={{ email: account.email }} />
          ) : (
            <Trans i18nKey="verifyEmail.pendingBodyNoEmail" />
          )}
        </p>

        {verification.isError ? <ErrorState message={t('verifyEmail.sessionError')} retryLabel={t('verifyEmail.retrySession')}
          onRetry={() => { void verification.refetch() }} /> : null}

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
          className="text-ui text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]"
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
  redirectTo?: string
}

/** Result screen for a clicked `?token=` verification link. */
function VerifyEmailResult({ token, authenticated, redirectTo }: VerifyEmailResultProps) {
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
      () => authenticated && redirectTo
        ? navigate({ href: redirectTo })
        : navigate({ to: authenticated ? '/' : '/login', ...(redirectTo ? { search: { redirect: redirectTo } } : {}) }),
      1500,
    )
    return () => window.clearTimeout(id)
  }, [outcome, authenticated, navigate, redirectTo])

  const forwardAction = authenticated ? (
    <AuthSubmitButton type="button" onClick={() => redirectTo ? navigate({ href: redirectTo }) : navigate({ to: '/' })}>
      {t('verifyEmail.goToApp')}
    </AuthSubmitButton>
  ) : (
    <Link to="/login" search={redirectTo ? { redirect: redirectTo } : {}} className="w-full">
      <AuthSubmitButton type="button" className="w-full">
        {t('verifyEmail.goToLogin')}
      </AuthSubmitButton>
    </Link>
  )

  if (outcome === 'pending') {
    return (
      <AuthStepShell
        showBrand
        align="center"
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
        showBrand
        align="center"
        title={t('verifyEmail.successTitle')}
        subtitle={t('verifyEmail.successSubtitle')}
      >
        <div className="flex flex-col items-center gap-4">{forwardAction}</div>
      </AuthStepShell>
    )
  }

  // expired | invalid
  const isExpired = outcome === 'expired'
  return (
    <AuthStepShell
      showBrand
      align="center"
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
