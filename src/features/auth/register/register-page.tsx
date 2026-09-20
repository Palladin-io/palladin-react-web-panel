import { useMemo, useState } from 'react'
import { HTTPError } from 'ky'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { generateRecoveryMnemonic } from '../../../shared/lib/mnemonic'
import { useRegister } from '../hooks/use-register'
import { parseAuthRedirect } from '../../../shared/lib/auth-redirect'
import {
  RegisterCredentialsStep,
  type RegisterCredentialsValues,
} from './components/register-credentials-step'
import {
  RegisterRecoveryConfirmStep,
  RegisterRecoveryStep,
} from './components/register-recovery-steps'

type Step = 'credentials' | 'recovery' | 'confirm'

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
interface RegisterPageProps { redirectTo?: string }

export function RegisterPage({ redirectTo }: RegisterPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const register = useRegister()
  const destination = parseAuthRedirect(redirectTo)

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
        onSuccess: () => destination ? navigate({ href: destination }) : navigate({ to: '/' }),
        onError: (err) => {
          // A 409 means the email is already registered — tell the user exactly
          // that (and to sign in) instead of a generic "try again" they'd loop on.
          const emailTaken = err instanceof HTTPError && err.response.status === 409
          setErrorMessage(t(emailTaken ? 'register.errorEmailTaken' : 'register.errorGeneric'))
        },
      },
    )
  }

  if (step === 'credentials') {
    return (
      <RegisterCredentialsStep
        redirectTo={destination}
        initialEmail={credentials?.email}
        initialPassword={credentials?.password}
        onContinue={handleCredentials}
      />
    )
  }

  if (step === 'recovery') {
    return (
      <RegisterRecoveryStep
        mnemonic={mnemonic}
        onBack={() => setStep('credentials')}
        onContinue={() => setStep('confirm')}
      />
    )
  }

  return (
    <RegisterRecoveryConfirmStep
      mnemonic={mnemonic}
      isSubmitting={register.isPending}
      error={errorMessage}
      onBack={() => setStep('recovery')}
      onConfirmed={handleCreate}
    />
  )
}
