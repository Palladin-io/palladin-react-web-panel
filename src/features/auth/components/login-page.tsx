import { useGoogleLogin } from '@react-oauth/google'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppWordmark } from '../../../shared/components/app-wordmark'
import { useLogin } from '../hooks/use-login'
import { usePasswordLogin } from '../hooks/use-password-login'
import { EmailPasswordForm } from './email-password-form'
import { TotpChallengeStep } from './totp-challenge-step'

const WELCOME_MESSAGE_KEYS = [
  'auth.welcomeLine1',
  'auth.welcomeLine2',
  'auth.welcomeLine3',
  'auth.welcomeLine4',
]

function RotatingWelcome() {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % WELCOME_MESSAGE_KEYS.length)
        setVisible(true)
      }, 350)
    }, 3800)
    return () => clearInterval(id)
  }, [])

  return (
    <p
      className="mb-7 h-4 text-ui text-[#8A95A6] transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {t(WELCOME_MESSAGE_KEYS[index])}
    </p>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const oauth = useLogin()
  const { start, submitTotp } = usePasswordLogin()
  const [tooltipTarget, setTooltipTarget] = useState<string | null>(null)

  // 'credentials' collects email + password; 'totp' handles the second factor.
  // The password is retained across the TOTP step (in memory only) so the
  // master key can be derived once the challenge clears.
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [pendingPassword, setPendingPassword] = useState('')
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
    onError: (error) => {
      console.error('Google login failed:', error)
      toast.error(t('auth.errorGoogleSignInFailed'))
    },
  })

  const handleCredentials = (email: string, password: string) => {
    setPasswordError(null)
    setPendingPassword(password)
    start.mutate(
      { email, password },
      {
        onSuccess: (result) => {
          if (result.kind === 'totp') {
            setChallengeToken(result.challengeToken)
            setTotpError(null)
            setStep('totp')
          } else {
            navigate({ to: '/' })
          }
        },
        onError: () => setPasswordError(t('login.errorInvalid')),
      },
    )
  }

  const handleTotp = (code: string) => {
    setTotpError(null)
    submitTotp.mutate(
      { challengeToken, code, password: pendingPassword },
      {
        onSuccess: () => navigate({ to: '/' }),
        onError: () => setTotpError(t('totpChallenge.errorInvalid')),
      },
    )
  }

  const handleBackToCredentials = () => {
    setStep('credentials')
    setChallengeToken('')
    setTotpError(null)
  }

  return (
    <div
      className="dark flex min-h-screen items-center justify-center"
      style={{
        background:
          'linear-gradient(160deg, #15171B 0%, #212429 30%, #1A1D22 60%, #15171B 100%)',
      }}
    >
      <div className="w-full max-w-[27.5rem] px-6">
        <div className="text-center">
          <div className="mb-2 flex justify-center">
            <AppWordmark size="lg" />
          </div>

          <RotatingWelcome />

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
                <span className="h-px flex-1 bg-[rgba(232,234,237,0.1)]" />
                <span className="text-micro text-[#6B7A8E]">{t('login.orContinueWith')}</span>
                <span className="h-px flex-1 bg-[rgba(232,234,237,0.1)]" />
              </div>

              {/* OAuth buttons */}
              <div className="flex flex-col gap-3">
                {/* Google — active */}
                <button
                  type="button"
                  onClick={() => googleLogin()}
                  disabled={oauth.isPending}
                  className="flex w-full items-center gap-3 rounded-lg border border-[rgba(232,234,237,0.06)]
                    bg-[rgba(232,234,237,0.04)] px-3.5 py-2.5 text-heading-sm font-medium
                    text-[#E8EAED] shadow-[0_1px_4px_rgba(0,0,0,0.2)] backdrop-blur-xl
                    transition-colors hover:bg-[rgba(232,234,237,0.08)]
                    disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#4285F4] text-meta font-bold text-white">
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
                    className="flex w-full items-center gap-3 rounded-lg border border-[rgba(232,234,237,0.06)]
                      bg-[rgba(232,234,237,0.04)] px-3.5 py-2.5 text-heading-sm font-medium
                      text-[#E8EAED] shadow-[0_1px_4px_rgba(0,0,0,0.2)] backdrop-blur-xl
                      disabled:cursor-not-allowed disabled:opacity-40"
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
                    className="flex w-full items-center gap-3 rounded-lg border border-[rgba(232,234,237,0.06)]
                      bg-[rgba(232,234,237,0.04)] px-3.5 py-2.5 text-heading-sm font-medium
                      text-[#E8EAED] shadow-[0_1px_4px_rgba(0,0,0,0.2)] backdrop-blur-xl
                      disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-meta font-bold text-black">
                      &#120143;
                    </span>
                    <span>{t('auth.continueWithX')}</span>
                  </button>
                  {tooltipTarget === 'x' && <Tooltip />}
                </div>
              </div>

              {/* Sign up — a ghost button so it reads as a distinct mode switch,
                  not another OAuth provider in the filled-card list above. */}
              <Link
                to="/register"
                className="mt-5 flex w-full items-center justify-center rounded-lg border
                  border-[rgba(232,234,237,0.14)] bg-transparent px-3.5 py-2.5 text-heading-sm
                  font-medium text-[#E8EAED] transition-colors hover:bg-[rgba(232,234,237,0.06)]"
              >
                {t('login.createAccount')}
              </Link>

              <p className="mt-4 text-micro text-[#6B7A8E]">{t('auth.legalFooter')}</p>
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
        bg-[#20242C] px-2 py-1 text-micro text-[#6B7A8E] shadow-lg"
    >
      {t('auth.comingSoon')}
    </span>
  )
}
