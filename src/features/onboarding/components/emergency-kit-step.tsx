import { useTranslation } from 'react-i18next'
import { EmergencyKitPanel } from '../../../shared/components/emergency-kit-panel'
import type { EmergencyKitMaterial } from '../../../shared/crypto/secret-key'
import { OnboardingShell } from './onboarding-shell'

export interface EmergencyKitStepProps {
  kit: EmergencyKitMaterial
  onContinue: () => void
}

/** Last onboarding step: completion waits for the downloaded and acknowledged kit. */
export function EmergencyKitStep({ kit, onContinue }: EmergencyKitStepProps) {
  const { t } = useTranslation()

  return (
    <OnboardingShell
      title={t('emergencyKit.title')}
      subtitle={t('emergencyKit.subtitle')}
      stepIndex={3}
      totalSteps={4}
    >
      <EmergencyKitPanel kit={kit} continueLabel={t('emergencyKit.continue')} onContinue={onContinue} />
    </OnboardingShell>
  )
}
