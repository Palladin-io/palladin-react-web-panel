import { useEffect, useState } from 'react'
import { analytics } from '../../../shared/lib/analytics'
import {
  evaluatePasswordStrength,
  isPasswordAcceptable,
  type PasswordStrength,
} from '../lib/password-strength'
import { OnboardingShell } from './onboarding-shell'

export interface MasterPasswordStepProps {
  onContinue: (password: string) => void
}

export function MasterPasswordStep({ onContinue }: MasterPasswordStepProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    analytics.capture('onboarding', 'setup-page-viewed')
  }, [])

  const { score, label } = evaluatePasswordStrength(password)
  const passwordsMatch = password.length > 0 && password === confirm
  const canSubmit = isPasswordAcceptable(score) && passwordsMatch

  return (
    <OnboardingShell
      title="Set Master Password"
      subtitle={
        <>
          This password encrypts your vault locally.
          <br />
          We never see it.
        </>
      }
      stepIndex={0}
      totalSteps={3}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) {
            onContinue(password)
          }
        }}
      >
        <div>
          <label htmlFor="master-password" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
            Master Password
          </label>
          <input
            id="master-password"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)]
              px-3 py-2.5 text-sm text-[#FDF9E4] placeholder:text-[#6B7A8E]
              focus:border-[#2EC4B6] focus:outline-none"
            placeholder="Enter a strong password"
          />
          <StrengthBar score={score} />
          <p className="mt-1 text-[11px] text-[#6B7A8E]">{label}</p>
        </div>

        <div>
          <label htmlFor="master-password-confirm" className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
            Confirm Password
          </label>
          <input
            id="master-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)]
              px-3 py-2.5 text-sm text-[#FDF9E4] placeholder:text-[#6B7A8E]
              focus:border-[#2EC4B6] focus:outline-none"
            placeholder="Retype your password"
          />
          <p className={`mt-1 text-[11px] text-[#FF4F4F] ${confirm.length > 0 && !passwordsMatch ? '' : 'invisible'}`}>
            Passwords do not match.
          </p>
        </div>

        <div className="rounded-lg border border-[rgba(253,249,228,0.06)] bg-[rgba(253,249,228,0.04)] px-3 py-2.5">
          <p className="text-xs text-[#FDF9E4]">
            Your password is never sent to our servers. All encryption happens on this device.
          </p>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-[#FF4F4F] px-4 py-2.5 text-sm font-medium text-white
            transition-colors hover:bg-[#e04545]
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          Set Master Password
        </button>
      </form>
    </OnboardingShell>
  )
}

interface StrengthBarProps {
  score: PasswordStrength
}

function StrengthBar({ score }: StrengthBarProps) {
  return (
    <div className="mt-2 flex gap-1">
      {[1, 2, 3, 4].map((segment) => (
        <div
          key={segment}
          className={
            'h-1 flex-1 rounded ' +
            (segment <= score ? colorForScore(score) : 'bg-[rgba(253,249,228,0.06)]')
          }
        />
      ))}
    </div>
  )
}

function colorForScore(score: PasswordStrength): string {
  if (score <= 1) return 'bg-[#FF4F4F]'
  if (score === 2) return 'bg-[#FFB84F]'
  return 'bg-[#2EC4B6]'
}
