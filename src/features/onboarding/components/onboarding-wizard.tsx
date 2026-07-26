import { useEffect, useMemo, useState } from 'react'
import { useCompleteSetup } from '../hooks/use-complete-setup'
import { generateRecoveryMnemonic } from '../../../shared/lib/mnemonic'
import { MasterPasswordStep } from './master-password-step'
import { RecoveryKeyConfirmStep } from './recovery-key-confirm-step'
import { RecoveryKeyStep } from './recovery-key-step'
import { generateAccountSecret } from '../../../shared/crypto/identity-kdf'
import { wipe } from '../../../shared/crypto/sodium'
import { AccountSecretDisplay } from '../../../shared/components/account-secret-display'
import { AuthStepShell } from '../../../shared/components/auth-step-shell'
import { useTranslation } from 'react-i18next'

type WizardStep = 'master-password' | 'recovery-key' | 'confirm' | 'account-secret'

/**
 * Runs the first-login key-setup flow.
 *
 * State discipline: the master password and the recovery mnemonic live in
 * component state only. They never touch localStorage / sessionStorage /
 * Zustand — closing the tab mid-flow forces a restart, which is by design.
 */
export function OnboardingWizard() {
  const { t } = useTranslation()
  const [step, setStep] = useState<WizardStep>('master-password')
  const [masterPassword, setMasterPassword] = useState<string | null>(null)
  const [accountSecret, setAccountSecret] = useState<Uint8Array | null>(null)

  // Generate the mnemonic once on mount so stepping back/forward between
  // screens doesn't regenerate (and invalidate) the user's recovery key.
  const mnemonic = useMemo(() => generateRecoveryMnemonic(), [])

  useEffect(() => {
    let secret: Uint8Array | null = null
    let disposed = false
    void generateAccountSecret().then((generated) => {
      if (disposed) {
        wipe(generated)
        return
      }
      secret = generated
      setAccountSecret(generated)
    })
    return () => {
      disposed = true
      if (secret) wipe(secret)
    }
  }, [])

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

  if (step === 'account-secret') {
    if (!accountSecret || !masterPassword) return null
    return (
      <AuthStepShell
        title={t('accountSecret.title')}
        subtitle={t('accountSecret.registrationSubtitle')}
        onBack={() => setStep('confirm')}
        backLabel={t('common.back')}
      >
        <AccountSecretDisplay
          accountSecret={accountSecret}
          isPending={completeSetup.isPending}
          error={completeSetup.isError ? t('accountSecret.upgradeError') : null}
          onContinue={() => completeSetup.mutate({
            masterPassword,
            recoveryMnemonic: mnemonic,
            accountSecret,
          })}
        />
      </AuthStepShell>
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
        setStep('account-secret')
      }}
    />
  )
}
