import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analytics } from '../../../shared/lib/analytics'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { PasswordStrengthBar } from '../../../shared/components/password-strength-bar'
import {
  evaluatePasswordStrength,
  isPasswordAcceptable,
} from '../../../shared/lib/password-strength'
import { OnboardingShell } from './onboarding-shell'

export interface MasterPasswordStepProps {
  onContinue: (password: string) => void
  initialPassword?: string
}

export function MasterPasswordStep({ onContinue, initialPassword }: MasterPasswordStepProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState(initialPassword ?? '')
  const [confirm, setConfirm] = useState(initialPassword ?? '')

  useEffect(() => {
    analytics.capture('onboarding', 'setup-page-viewed')
  }, [])

  const { score } = evaluatePasswordStrength(password)
  const passwordsMatch = password.length > 0 && password === confirm
  const canSubmit = isPasswordAcceptable(score) && passwordsMatch

  return (
    <OnboardingShell
      title={t('onboarding.masterPasswordTitle')}
      subtitle={
        <>
          {t('onboarding.masterPasswordSubtitle1')}
          <br />
          {t('onboarding.masterPasswordSubtitle2')}
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
            label={t('onboarding.masterPasswordLabel')}
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('onboarding.masterPasswordPlaceholder')}
          />
          <PasswordStrengthBar score={score} />
        </div>

        <div>
          <FormInput
            id="master-password-confirm"
            label={t('onboarding.confirmPasswordLabel')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('onboarding.confirmPasswordPlaceholder')}
            error={confirm.length > 0 && !passwordsMatch}
          />
          {confirm.length > 0 && !passwordsMatch && (
            <FieldFeedback visible color="red">
              {t('onboarding.passwordsDoNotMatch')}
            </FieldFeedback>
          )}
        </div>

        <div className="rounded-lg border border-[rgba(253,249,228,0.06)] bg-[rgba(253,249,228,0.04)] px-3 py-2">
          <p className="text-xs text-[#FDF9E4]">
            {t('onboarding.encryptionNote')}
          </p>
        </div>

        <AuthSubmitButton disabled={!canSubmit}>
          {t('onboarding.masterPasswordButton')}
        </AuthSubmitButton>
      </form>
    </OnboardingShell>
  )
}
