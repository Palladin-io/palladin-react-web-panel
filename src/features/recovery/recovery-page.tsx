import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { analytics } from '../../shared/lib/analytics'
import { EnterRecoveryKeyStep } from './components/enter-recovery-key-step'
import { NewPasswordStep } from './components/new-password-step'
import { NewRecoveryKeyStep } from './components/new-recovery-key-step'
import { NewAccountSecretStep } from './components/new-account-secret-step'
import { InvalidRecoveryKeyError, useRecover } from './use-recover'
import { wipe } from '../../shared/crypto/sodium'

type Step = 'enter-key' | 'new-password' | 'new-recovery-key' | 'new-account-secret'

/**
 * Multi-step wizard for account recovery. Local state only — the mnemonic
 * and password never leave this component tree, and the derived keys live
 * only inside `useRecover`'s mutation scope. On the final step we navigate
 * the user to `/unlock` so they can log in with the new password.
 *
 * Page-level view tracking is owned by the individual step components
 * (each fires its own `*-page-viewed` event on mount) so we don't emit a
 * redundant wrapper event here.
 */
export function RecoveryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const recover = useRecover()

  const [step, setStep] = useState<Step>('enter-key')
  const [mnemonic, setMnemonic] = useState<string[]>([])
  const [newMnemonic, setNewMnemonic] = useState<string[]>([])
  const [newAccountSecret, setNewAccountSecret] = useState<Uint8Array | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => () => {
    if (newAccountSecret) wipe(newAccountSecret)
  }, [newAccountSecret])

  const handleKeySubmit = (words: string[]) => {
    setMnemonic(words)
    setErrorMessage(null)
    analytics.capture('recovery', 'recovery-started')
    setStep('new-password')
  }

  const handlePasswordSubmit = (password: string) => {
    setErrorMessage(null)
    recover.mutate(
      { recoveryMnemonic: mnemonic, newPassword: password },
      {
        onSuccess: (result) => {
          setNewMnemonic(result.recoveryMnemonic)
          setNewAccountSecret(result.accountSecret)
          setStep('new-recovery-key')
        },
        onError: (err) => {
          analytics.capture('recovery', 'recovery-failed')
          if (err instanceof InvalidRecoveryKeyError) {
            // Wrong mnemonic — clear it and route the user back to step 1
            // with an inline error explaining why. Re-typing is the only
            // recovery path.
            setMnemonic([])
            setErrorMessage(t('recovery.errorInvalidKey'))
            setStep('enter-key')
          } else {
            setErrorMessage(t('recovery.errorGeneric'))
          }
        },
      },
    )
  }

  const handleFinish = () => {
    analytics.capture('recovery', 'recovery-completed')
    navigate({ to: '/unlock' })
  }

  if (step === 'enter-key') {
    return (
      <EnterRecoveryKeyStep
        initialWords={mnemonic}
        errorMessage={errorMessage}
        onSubmit={handleKeySubmit}
      />
    )
  }

  if (step === 'new-password') {
    return (
      <NewPasswordStep
        isSubmitting={recover.isPending}
        errorMessage={errorMessage}
        onBack={() => setStep('enter-key')}
        onSubmit={handlePasswordSubmit}
      />
    )
  }

  if (step === 'new-recovery-key') {
    return (
      <NewRecoveryKeyStep
        mnemonic={newMnemonic}
        onFinish={() => setStep('new-account-secret')}
      />
    )
  }

  if (!newAccountSecret) return null
  return <NewAccountSecretStep accountSecret={newAccountSecret} onFinish={handleFinish} />
}
