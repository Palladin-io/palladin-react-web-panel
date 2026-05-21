import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analytics } from '../../../shared/lib/analytics'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { PasswordStrengthBar } from '../../../shared/components/password-strength-bar'
import {
  evaluatePasswordStrength,
  isPasswordAcceptable,
} from '../../../shared/lib/password-strength'
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
        <div className="-mb-3">
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
          <PasswordStrengthBar score={score} />
          <FieldFeedback visible={password.length > 0} color="teal">
            {label}
          </FieldFeedback>
        </div>

        <div className="-mb-3">
          <FormInput
            id="recovery-confirm-password"
            label={t('recovery.confirmPasswordLabel')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('recovery.confirmPasswordPlaceholder')}
            disabled={isSubmitting}
            error={confirm.length > 0 && !passwordsMatch}
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
