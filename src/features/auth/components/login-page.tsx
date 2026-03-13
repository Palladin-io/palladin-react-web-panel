import { useGoogleLogin } from '@react-oauth/google'
import { useState } from 'react'
import { useLogin } from '../hooks/use-login'

export function LoginPage() {
  const login = useLogin()
  const [tooltipTarget, setTooltipTarget] = useState<string | null>(null)

  const googleLogin = useGoogleLogin({
    onSuccess: (response) => {
      login.mutate(response.access_token)
    },
    onError: () => {
      // Google login popup was closed or errored
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
          <h1 className="mb-1 text-[28px] font-extrabold tracking-tight">
            <span className="text-[#FDF9E4]">claw</span>
            <span className="text-[#FF4F4F]">vault</span>
          </h1>

          {/* Tagline */}
          <p className="mb-7 text-sm text-[#6B7A8E]">
            Zero-Knowledge Password Manager
            <br />
            for AI Agents
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
                {login.isPending ? 'Signing in...' : 'Continue with Google'}
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
                <span>Continue with Apple</span>
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
                <span>Continue with X</span>
              </button>
              {tooltipTarget === 'x' && <Tooltip />}
            </div>
          </div>

          {/* Error message */}
          {login.isError && (
            <p className="mt-4 text-xs text-[#FF4F4F]">
              Sign in failed. Please try again.
            </p>
          )}

          {/* Footer */}
          <p className="mt-5 text-[10px] text-[#6B7A8E]">
            By continuing, you agree to our Terms &amp; Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}

function Tooltip() {
  return (
    <span
      role="tooltip"
      className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded
        bg-[#1a2a4a] px-2 py-1 text-[10px] text-[#6B7A8E] shadow-lg"
    >
      Coming soon
    </span>
  )
}
