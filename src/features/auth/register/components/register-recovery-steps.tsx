import { useTranslation } from 'react-i18next'
import { AuthStepShell } from '../../../../shared/components/auth-step-shell'
import { RecoveryKeyConfirmationForm } from '../../../../shared/components/recovery-key-confirmation-form'
import { RecoveryKeyDisplay } from '../../../../shared/components/recovery-key-display'

interface RegisterRecoveryStepProps {
  mnemonic: string[]
  onBack: () => void
  onContinue: () => void
}

export function RegisterRecoveryStep({
  mnemonic,
  onBack,
  onContinue,
}: RegisterRecoveryStepProps) {
  const { t } = useTranslation()

  return (
    <AuthStepShell
      title={t('onboarding.recoveryKeyTitle')}
      subtitle={t('onboarding.recoveryKeySubtitle')}
      progress={{ current: 1, total: 3 }}
      onBack={onBack}
      backLabel={t('common.back')}
    >
      <RecoveryKeyDisplay
        mnemonic={mnemonic}
        continueLabel={t('onboarding.savedRecoveryKey')}
        onContinue={onContinue}
      />
    </AuthStepShell>
  )
}

interface RegisterRecoveryConfirmStepProps {
  mnemonic: string[]
  isSubmitting: boolean
  error: string | null
  onBack: () => void
  onConfirmed: () => void
}

export function RegisterRecoveryConfirmStep({
  mnemonic,
  isSubmitting,
  error,
  onBack,
  onConfirmed,
}: RegisterRecoveryConfirmStepProps) {
  const { t } = useTranslation()

  return (
    <AuthStepShell
      title={t('onboarding.confirmTitle')}
      subtitle={t('onboarding.confirmSubtitle')}
      progress={{ current: 2, total: 3 }}
      onBack={isSubmitting ? undefined : onBack}
      backLabel={t('common.back')}
    >
      <RecoveryKeyConfirmationForm
        mnemonic={mnemonic}
        isSubmitting={isSubmitting}
        error={error}
        onConfirmed={onConfirmed}
      />
    </AuthStepShell>
  )
}
