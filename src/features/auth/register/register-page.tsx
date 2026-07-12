import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { generateRecoveryMnemonic } from '../../../shared/lib/mnemonic'
import { useRegister } from '../hooks/use-register'
import {
  RegisterCredentialsStep,
  type RegisterCredentialsValues,
} from './components/register-credentials-step'
import { RegisterRecoveryStep } from './components/register-recovery-step'

type Step = 'credentials' | 'recovery'

/**
 * Email + password registration wizard.
 *
 * State discipline mirrors onboarding: email, password, and the recovery
 * mnemonic live in component state only — never localStorage / Zustand — so
 * closing the tab mid-flow forces a clean restart. On success the register hook
 * has already set the session tokens and unlocked the vault (it holds MK +
 * private key), so we land the user on the dashboard where the verify-email
 * banner nudges them to confirm their address.
 */
export function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const register = useRegister()

  const [step, setStep] = useState<Step>('credentials')
  const [credentials, setCredentials] = useState<RegisterCredentialsValues | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Generate the mnemonic once so stepping back to credentials and forward
  // again doesn't regenerate (and invalidate) the phrase being shown.
  const mnemonic = useMemo(() => generateRecoveryMnemonic(), [])

  const handleCredentials = (values: RegisterCredentialsValues) => {
    setCredentials(values)
    setErrorMessage(null)
    setStep('recovery')
  }

  const handleCreate = () => {
    if (!credentials) {
      setStep('credentials')
      return
    }
    setErrorMessage(null)
    register.mutate(
      {
        email: credentials.email,
        masterPassword: credentials.password,
        recoveryMnemonic: mnemonic,
      },
      {
        onSuccess: () => navigate({ to: '/' }),
        onError: () => setErrorMessage(t('register.errorGeneric')),
      },
    )
  }

  if (step === 'credentials') {
    return (
      <RegisterCredentialsStep
        initialEmail={credentials?.email}
        initialPassword={credentials?.password}
        onContinue={handleCredentials}
      />
    )
  }

  return (
    <RegisterRecoveryStep
      mnemonic={mnemonic}
      isSubmitting={register.isPending}
      errorMessage={errorMessage}
      onBack={() => setStep('credentials')}
      onConfirmed={handleCreate}
    />
  )
}
