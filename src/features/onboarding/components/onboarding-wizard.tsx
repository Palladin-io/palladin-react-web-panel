import { useMemo, useState } from 'react'
import { useCompleteSetup } from '../hooks/use-complete-setup'
import { generateRecoveryMnemonic } from '../../../shared/lib/mnemonic'
import { MasterPasswordStep } from './master-password-step'
import { RecoveryKeyConfirmStep } from './recovery-key-confirm-step'
import { RecoveryKeyStep } from './recovery-key-step'

type WizardStep = 'master-password' | 'recovery-key' | 'confirm'

/**
 * Runs the first-login key-setup flow.
 *
 * State discipline: the master password and the recovery mnemonic live in
 * component state only. They never touch localStorage / sessionStorage /
 * Zustand — closing the tab mid-flow forces a restart, which is by design.
 */
export function OnboardingWizard() {
  const [step, setStep] = useState<WizardStep>('master-password')
  const [masterPassword, setMasterPassword] = useState<string | null>(null)

  // Generate the mnemonic once on mount so stepping back/forward between
  // screens doesn't regenerate (and invalidate) the user's recovery key.
  const mnemonic = useMemo(() => generateRecoveryMnemonic(), [])

  const completeSetup = useCompleteSetup()

  if (step === 'master-password') {
    return (
      <MasterPasswordStep
        initialPassword={masterPassword ?? undefined}
        onContinue={(password) => {
          setMasterPassword(password)
          setStep('recovery-key')
        }}
      />
    )
  }

  if (step === 'recovery-key') {
    return (
      <RecoveryKeyStep
        mnemonic={mnemonic}
        onContinue={() => setStep('confirm')}
        onBack={() => setStep('master-password')}
      />
    )
  }

  return (
    <RecoveryKeyConfirmStep
      mnemonic={mnemonic}
      isSubmitting={false}
      error={null}
      onBack={() => setStep('recovery-key')}
      onConfirmed={() => {
        if (!masterPassword) {
          setStep('master-password')
          return
        }
        completeSetup.mutate({ masterPassword, recoveryMnemonic: mnemonic })
      }}
    />
  )
}
