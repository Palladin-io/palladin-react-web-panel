import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analytics } from '../../../shared/lib/analytics'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import {
  evaluatePasswordStrength,
  isPasswordAcceptable,
  type PasswordStrength,
} from '../../onboarding/lib/password-strength'
import { RecoveryShell } from './recovery-shell'

export interface NewPasswordStepProps {
  isSubmitting: boolean
  /** Inline error surfaced after a failed recovery attempt (generic). */
  errorMessage: string | null
  onSubmit: (password: string) => void
  onBack: () => void
}

/**
 * Step 2 of the recovery wizard — collect the new master password and run
 * the crypto pipeline. Password-strength UX mirrors the onboarding step so
 * users see a consistent signal for what counts as "acceptable".
 */
export function NewPasswordStep({
  isSubmitting,
  errorMessage,
  onSubmit,
  onBack,
}: NewPasswordStepProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    analytics.capture('recovery', 'new-password-page-viewed')
  }, [])

  const { score, label } = evaluatePasswordStrength(password)
  const passwordsMatch = password.length > 0 && password === confirm
  const canSubmit = !isSubmitting && isPasswordAcceptable(score) && passwordsMatch
  const hasError = errorMessage !== null

  return (
    <RecoveryShell
      title={t('recovery.newPasswordTitle')}
      subtitle={t('recovery.newPasswordSubtitle')}
      onBack={isSubmitting ? undefined : onBack}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) onSubmit(password)
        }}
      >
        <div>
          <FormInput
            id="recovery-new-password"
            label={t('recovery.newPasswordLabel')}
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('recovery.newPasswordPlaceholder')}
            disabled={isSubmitting}
          />
          <StrengthBar score={score} />
          <FieldFeedback visible={password.length > 0} color="teal">
            {label}
          </FieldFeedback>
        </div>

        <div>
          <FormInput
            id="recovery-confirm-password"
            label={t('recovery.confirmPasswordLabel')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('recovery.confirmPasswordPlaceholder')}
            disabled={isSubmitting}
          />
          <FieldFeedback visible={confirm.length > 0 && !passwordsMatch} color="red">
            {t('onboarding.passwordsDoNotMatch')}
          </FieldFeedback>
        </div>

        <FieldFeedback visible={hasError} color="red">
          {errorMessage}
        </FieldFeedback>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-1 w-full rounded-lg bg-[#FF4F4F] px-4 py-2.5 text-sm font-semibold text-white
            transition-colors hover:bg-[#e04545]
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? t('recovery.recovering') : t('recovery.recover')}
        </button>
      </form>
    </RecoveryShell>
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
