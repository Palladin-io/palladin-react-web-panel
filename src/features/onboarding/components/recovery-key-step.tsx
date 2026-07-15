import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { analytics } from '../../../shared/lib/analytics'
import { RecoveryKeyDisplay } from '../../../shared/components/recovery-key-display'
import { OnboardingShell } from './onboarding-shell'

export interface RecoveryKeyStepProps {
  mnemonic: string[]
  onContinue: () => void
  onBack?: () => void
}

export function RecoveryKeyStep({ mnemonic, onContinue, onBack }: RecoveryKeyStepProps) {
  const { t } = useTranslation()

  useEffect(() => {
    analytics.capture('onboarding', 'recovery-key-page-viewed')
  }, [])

  return (
    <OnboardingShell
      title={t('onboarding.recoveryKeyTitle')}
      subtitle={t('onboarding.recoveryKeySubtitle')}
      stepIndex={1}
      totalSteps={3}
      onBack={onBack}
    >
      <RecoveryKeyDisplay
        mnemonic={mnemonic}
        continueLabel={t('onboarding.savedRecoveryKey')}
        onContinue={onContinue}
      />
    </OnboardingShell>
  )
}
