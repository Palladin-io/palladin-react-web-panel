import { useTranslation } from 'react-i18next'
import { AuthStepShell } from '../../../../shared/components/auth-step-shell'
import { RecoveryKeyConfirmationForm } from '../../../../shared/components/recovery-key-confirmation-form'
import { RecoveryKeyDisplay } from '../../../../shared/components/recovery-key-display'
import { AccountSecretDisplay } from '../../../../shared/components/account-secret-display'

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
      progress={{ current: 1, total: 4 }}
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
      progress={{ current: 2, total: 4 }}
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

interface RegisterAccountSecretStepProps {
  accountSecret: Uint8Array
  isSubmitting: boolean
  error?: string | null
  onBack: () => void
  onContinue: () => void
}

export function RegisterAccountSecretStep({
  accountSecret,
  isSubmitting,
  error,
  onBack,
  onContinue,
}: RegisterAccountSecretStepProps) {
  const { t } = useTranslation()

  return (
    <AuthStepShell
      title={t('accountSecret.title')}
      subtitle={t('accountSecret.registrationSubtitle')}
      progress={{ current: 3, total: 4 }}
      onBack={onBack}
      backLabel={t('common.back')}
    >
      <AccountSecretDisplay
        accountSecret={accountSecret}
        isPending={isSubmitting}
        error={error}
        onContinue={onContinue}
      />
    </AuthStepShell>
  )
}
