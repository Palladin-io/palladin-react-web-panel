import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { analytics } from '../../../shared/lib/analytics'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { RecoveryMnemonicPanel } from '../../../shared/components/recovery-mnemonic-panel'
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
      <div className="flex flex-col gap-3">
        <RecoveryMnemonicPanel mnemonic={mnemonic} />

        <AuthSubmitButton type="button" onClick={onContinue}>
          <Check size={14} />
          {t('onboarding.savedRecoveryKey')}
        </AuthSubmitButton>
      </div>
    </OnboardingShell>
  )
}
