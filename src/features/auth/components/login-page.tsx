import { useGoogleLogin } from '@react-oauth/google'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Trans, useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AuthBrandHeader } from '../../../shared/components/auth-brand-header'
import { AuthRateLimitError } from '../api/auth-api'
import { useLogin } from '../hooks/use-login'
import { usePasswordLogin } from '../hooks/use-password-login'
import { clearClientSession } from '../session/client-session'
import { EmailPasswordForm } from './email-password-form'
import { TotpChallengeStep } from './totp-challenge-step'

interface LoginPageProps {
  redirectTo?: string
}

export function LoginPage({ redirectTo = '/' }: LoginPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const oauth = useLogin(redirectTo)
  const { start, submitTotp } = usePasswordLogin()
  const [tooltipTarget, setTooltipTarget] = useState<string | null>(null)

  // 'credentials' collects email + password; 'totp' handles the second factor.
  // The password is retained across the TOTP step (in memory only) so the
  // master key can be derived once the challenge clears.
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [challengeToken, setChallengeToken] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [totpError, setTotpError] = useState<string | null>(null)

  useEffect(() => {
    if (oauth.isError) toast.error(t('auth.errorSignInFailed'))
  }, [oauth.isError, t])

  const googleLogin = useGoogleLogin({
    onSuccess: (response) => {
      oauth.mutate(response.access_token)
    },
    onError: () => {
      toast.error(t('auth.errorGoogleSignInFailed'))
    },
  })

  const handleGoogleLogin = () => {
    void clearClientSession()
      .then(() => googleLogin())
      .catch(() => toast.error(t('auth.errorSignInFailed')))
  }

  const handleCredentials = (email: string, password: string) => {
    void clearClientSession()
      .then(() => {
        setPasswordError(null)
        start.mutate(
          { email, password },
          {
            onSuccess: (result) => {
              if (result.kind === 'totp') {
                setChallengeToken(result.challengeToken)
                setTotpError(null)
                setStep('totp')
              } else {
                navigate({ href: redirectTo })
              }
            },
            onError: (error) => setPasswordError(
              t(error instanceof AuthRateLimitError
                ? 'auth.errorRateLimited'
                : 'login.errorInvalid'),
            ),
          },
        )
      })
      .catch(() => {
        setPasswordError(t('auth.errorSignInFailed'))
      })
  }

  const handleTotp = (code: string) => {
    setTotpError(null)
    submitTotp.mutate(
      { challengeToken, code },
      {
        onSuccess: () => navigate({ href: redirectTo }),
        onError: (error) => setTotpError(
          t(error instanceof AuthRateLimitError
            ? 'auth.errorRateLimited'
            : 'totpChallenge.errorInvalid'),
        ),
      },
    )
  }

  const handleBackToCredentials = () => {
    setStep('credentials')
    setChallengeToken('')
    setTotpError(null)
  }

  return (
    <div className="auth-surface flex min-h-screen items-center justify-center">
      <div className="auth-logo-glow w-full max-w-[27.5rem] px-6">
        <div className="text-center">
          <AuthBrandHeader />

          {step === 'totp' ? (
            <TotpChallengeStep
              isPending={submitTotp.isPending}
              errorMessage={totpError}
              onSubmit={handleTotp}
              onBack={handleBackToCredentials}
              onFieldChange={() => setTotpError(null)}
            />
          ) : (
            <>
              <EmailPasswordForm
                isPending={start.isPending}
                errorMessage={passwordError}
                onSubmit={handleCredentials}
                onFieldChange={() => setPasswordError(null)}
              />

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--cv-auth-divider)]" />
                <span className="text-micro text-[var(--cv-auth-muted)]">
                  {t('login.orContinueWith')}
                </span>
                <span className="h-px flex-1 bg-[var(--cv-auth-divider)]" />
              </div>

              {/* OAuth buttons */}
              <div className="flex flex-col gap-3">
                {/* Google — active */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={oauth.isPending}
                  className="auth-glass-button flex h-control w-full items-center gap-3 rounded-lg border
                    px-3.5 text-heading-sm font-medium disabled:cursor-not-allowed"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--cv-google)] text-meta font-bold text-white">
                    G
                  </span>
                  <span>
                    {oauth.isPending ? t('auth.signingIn') : t('auth.continueWithGoogle')}
                  </span>
                </button>

                {/* Apple — disabled */}
                <div className="relative">
                  <button
                    type="button"
                    disabled
                    onMouseEnter={() => setTooltipTarget('apple')}
                    onMouseLeave={() => setTooltipTarget(null)}
                    className="auth-glass-button flex h-control w-full items-center gap-3 rounded-lg border
                      px-3.5 text-heading-sm font-medium disabled:cursor-not-allowed"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-meta font-bold text-black">
                      &#63743;
                    </span>
                    <span>{t('auth.continueWithApple')}</span>
                  </button>
                  {tooltipTarget === 'apple' && <Tooltip />}
                </div>

                {/* X — disabled */}
                <div className="relative">
                  <button
                    type="button"
                    disabled
                    onMouseEnter={() => setTooltipTarget('x')}
                    onMouseLeave={() => setTooltipTarget(null)}
                    className="auth-glass-button flex h-control w-full items-center gap-3 rounded-lg border
                      px-3.5 text-heading-sm font-medium disabled:cursor-not-allowed"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-meta font-bold text-black">
                      &#120143;
                    </span>
                    <span>{t('auth.continueWithX')}</span>
                  </button>
                  {tooltipTarget === 'x' && <Tooltip />}
                </div>
              </div>

              <p className="mt-5 text-micro text-[var(--cv-auth-muted)]">
                <Trans
                  i18nKey="auth.legalFooter"
                  components={{
                    terms: (
                      <a
                        href="https://palladin.io/terms/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline transition-colors hover:text-[var(--cv-t1)]"
                      />
                    ),
                    privacy: (
                      <a
                        href="https://palladin.io/privacy/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline transition-colors hover:text-[var(--cv-t1)]"
                      />
                    ),
                  }}
                />
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Tooltip() {
  const { t } = useTranslation()
  return (
    <span
      role="tooltip"
      className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded
        bg-[var(--cv-auth-tooltip-bg)] px-2 py-1 text-micro text-[var(--cv-auth-muted)] shadow-lg"
    >
      {t('auth.comingSoon')}
    </span>
  )
}
