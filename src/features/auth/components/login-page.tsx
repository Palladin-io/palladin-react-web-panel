import { useGoogleLogin } from '@react-oauth/google'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLogin } from '../hooks/use-login'

export function LoginPage() {
  const { t } = useTranslation()
  const login = useLogin()
  const [tooltipTarget, setTooltipTarget] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const googleLogin = useGoogleLogin({
    onSuccess: (response) => {
      setGoogleError(null)
      login.mutate(response.access_token)
    },
    onError: (error) => {
      console.error('Google login failed:', error)
      setGoogleError(t('auth.errorGoogleSignInFailed'))
    },
  })

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        background:
          'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)',
      }}
    >
      <div className="w-full max-w-[440px] px-6">
        <div className="text-center">
          {/* Logo */}
          <img
            src="/logo.png"
            alt={t('auth.appName')}
            className="mx-auto mb-4 h-16 w-16"
          />
          <h1 className="mb-1 text-[28px] font-extrabold tracking-tight">
            <span className="text-[#FDF9E4]">{t('auth.titleClaw')}</span>
            <span className="text-[#FF4F4F]">{t('auth.titleVault')}</span>
          </h1>

          {/* Tagline */}
          <p className="mb-7 text-sm text-[#6B7A8E]">
            {t('auth.taglineFirstLine')}
            <br />
            {t('auth.taglineForAiAgents')}
          </p>

          {/* OAuth buttons */}
          <div className="flex flex-col gap-3">
            {/* Google — active */}
            <button
              type="button"
              onClick={() => googleLogin()}
              disabled={login.isPending}
              className="flex w-full items-center gap-3 rounded-lg border border-[rgba(253,249,228,0.06)]
                bg-[rgba(253,249,228,0.04)] px-3.5 py-2.5 text-[13px] font-medium
                text-[#FDF9E4] shadow-[0_1px_4px_rgba(0,0,0,0.2)] backdrop-blur-xl
                transition-colors hover:bg-[rgba(253,249,228,0.08)]
                disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#4285F4] text-xs font-bold text-white">
                G
              </span>
              <span>
                {login.isPending ? t('auth.signingIn') : t('auth.continueWithGoogle')}
              </span>
            </button>

            {/* Apple — disabled */}
            <div className="relative">
              <button
                type="button"
                disabled
                onMouseEnter={() => setTooltipTarget('apple')}
                onMouseLeave={() => setTooltipTarget(null)}
                className="flex w-full items-center gap-3 rounded-lg border border-[rgba(253,249,228,0.06)]
                  bg-[rgba(253,249,228,0.04)] px-3.5 py-2.5 text-[13px] font-medium
                  text-[#FDF9E4] shadow-[0_1px_4px_rgba(0,0,0,0.2)] backdrop-blur-xl
                  disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-xs font-bold text-black">
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
                className="flex w-full items-center gap-3 rounded-lg border border-[rgba(253,249,228,0.06)]
                  bg-[rgba(253,249,228,0.04)] px-3.5 py-2.5 text-[13px] font-medium
                  text-[#FDF9E4] shadow-[0_1px_4px_rgba(0,0,0,0.2)] backdrop-blur-xl
                  disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-xs font-bold text-black">
                  &#120143;
                </span>
                <span>{t('auth.continueWithX')}</span>
              </button>
              {tooltipTarget === 'x' && <Tooltip />}
            </div>
          </div>

          {/* Error message */}
          {(login.isError || googleError) && (
            <p className="mt-4 text-xs text-[#FF4F4F]">
              {googleError ?? t('auth.errorSignInFailed')}
            </p>
          )}

          {/* Footer */}
          <p className="mt-5 text-[10px] text-[#6B7A8E]">
            {t('auth.legalFooter')}
          </p>
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
        bg-[#1a2a4a] px-2 py-1 text-[10px] text-[#6B7A8E] shadow-lg"
    >
      {t('auth.comingSoon')}
    </span>
  )
}
