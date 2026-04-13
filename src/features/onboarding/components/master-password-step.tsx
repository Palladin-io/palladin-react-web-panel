import { useEffect, useState } from 'react'
import { analytics } from '../../../shared/lib/analytics'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
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
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) {
            onContinue(password)
          }
        }}
      >
        <div>
          <FormInput
            id="master-password"
            label="Master Password"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a strong password"
          />
          <StrengthBar score={score} />
          <FieldFeedback visible={password.length > 0} color="teal">
            {label}
          </FieldFeedback>
        </div>

        <div>
          <FormInput
            id="master-password-confirm"
            label="Confirm Password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Retype your password"
          />
          <FieldFeedback visible={confirm.length > 0 && !passwordsMatch} color="red">
            Passwords do not match.
          </FieldFeedback>
        </div>

        <div className="rounded-lg border border-[rgba(253,249,228,0.06)] bg-[rgba(253,249,228,0.04)] px-3 py-2">
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
    <div className="mt-1.5 flex gap-1">
      {[1, 2, 3, 4].map((segment) => (
        <div
          key={segment}
          className={
            'h-1 flex-1 rounded transition-colors duration-300 ' +
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
