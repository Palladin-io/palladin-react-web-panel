import { useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { AuthStepShell } from '../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { getIsAuthenticated } from '../stores/auth-store'
import { useVerifyEmail } from '../hooks/use-verify-email'

export interface VerifyEmailPageProps {
  /** The verification token from the `?token=` query param. */
  token?: string
}

/**
 * Result screen for the `/verify-email?token=...` link. POSTs the token once on
 * mount and renders success / expired / invalid. Anonymous-friendly: the link
 * may be opened in a browser with no session.
 */
export function VerifyEmailPage({ token }: VerifyEmailPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const verify = useVerifyEmail()
  const authenticated = getIsAuthenticated()

  // Fire exactly once for a given token, even under StrictMode double-mount.
  const attempted = useRef(false)
  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    verify.mutate(token)
  }, [token, verify])

  const outcome = !token ? 'invalid' : verify.isPending || verify.isIdle ? 'pending' : verify.data

  if (outcome === 'pending') {
    return (
      <AuthStepShell showLogo logoAlt={t('auth.appName')} title={t('verifyEmail.verifyingTitle')} subtitle={t('verifyEmail.verifyingSubtitle')}>
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
          <CheckCircle2 className="h-10 w-10 text-[#10B981]" />
          {authenticated ? (
            <AuthSubmitButton type="button" onClick={() => navigate({ to: '/' })}>
              {t('verifyEmail.goToApp')}
            </AuthSubmitButton>
          ) : (
            <Link to="/login" className="w-full">
              <AuthSubmitButton type="button" className="w-full">
                {t('verifyEmail.goToLogin')}
              </AuthSubmitButton>
            </Link>
          )}
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
        {authenticated ? (
          <AuthSubmitButton type="button" onClick={() => navigate({ to: '/' })}>
            {t('verifyEmail.goToApp')}
          </AuthSubmitButton>
        ) : (
          <Link to="/login" className="w-full">
            <AuthSubmitButton type="button" className="w-full">
              {t('verifyEmail.goToLogin')}
            </AuthSubmitButton>
          </Link>
        )}
      </div>
    </AuthStepShell>
  )
}
