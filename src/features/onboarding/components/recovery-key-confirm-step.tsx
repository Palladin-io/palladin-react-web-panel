import { useTranslation } from 'react-i18next'
import { analytics } from '../../../shared/lib/analytics'
import { RecoveryKeyConfirmationForm } from '../../../shared/components/recovery-key-confirmation-form'
import { OnboardingShell } from './onboarding-shell'

export interface RecoveryKeyConfirmStepProps {
  mnemonic: string[]
  onConfirmed: () => void
  onBack: () => void
  isSubmitting: boolean
  error: string | null
}

export function RecoveryKeyConfirmStep({
  mnemonic,
  onConfirmed,
  onBack,
  isSubmitting,
  error,
}: RecoveryKeyConfirmStepProps) {
  const { t } = useTranslation()

  return (
    <OnboardingShell
      title={t('onboarding.confirmTitle')}
      subtitle={t('onboarding.confirmSubtitle')}
      stepIndex={2}
      totalSteps={3}
      onBack={onBack}
    >
      <RecoveryKeyConfirmationForm
        mnemonic={mnemonic}
        isSubmitting={isSubmitting}
        error={error}
        onConfirmed={onConfirmed}
        onValidated={captureRecoveryKeyConfirmed}
      />
    </OnboardingShell>
  )
}

function captureRecoveryKeyConfirmed() {
  analytics.capture('onboarding', 'recovery-key-confirmed')
}
