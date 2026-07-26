import { useEffect, useMemo, useState } from 'react'
import { HTTPError } from 'ky'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { generateRecoveryMnemonic } from '../../../shared/lib/mnemonic'
import { generateAccountSecret } from '../../../shared/crypto/identity-kdf'
import { wipe } from '../../../shared/crypto/sodium'
import { useRegister } from '../hooks/use-register'
import {
  RegisterCredentialsStep,
  type RegisterCredentialsValues,
} from './components/register-credentials-step'
import {
  RegisterRecoveryConfirmStep,
  RegisterRecoveryStep,
  RegisterAccountSecretStep,
} from './components/register-recovery-steps'

type Step = 'credentials' | 'recovery' | 'confirm' | 'account-secret'

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
  const [accountSecret, setAccountSecret] = useState<Uint8Array | null>(null)

  // Generate the mnemonic once so stepping back to credentials and forward
  // again doesn't regenerate (and invalidate) the phrase being shown.
  const mnemonic = useMemo(() => generateRecoveryMnemonic(), [])

  useEffect(() => {
    let generated: Uint8Array | null = null
    let disposed = false
    void generateAccountSecret().then((value) => {
      if (disposed) {
        wipe(value)
        return
      }
      generated = value
      setAccountSecret(value)
    })
    return () => {
      disposed = true
      if (generated) wipe(generated)
    }
  }, [])

  const handleCredentials = (values: RegisterCredentialsValues) => {
    setCredentials(values)
    setErrorMessage(null)
    setStep('recovery')
  }

  const handleCreate = () => {
    if (!credentials || !accountSecret) {
      setStep('credentials')
      return
    }
    setErrorMessage(null)
    register.mutate(
      {
        email: credentials.email,
        masterPassword: credentials.password,
        recoveryMnemonic: mnemonic,
        accountSecret,
      },
      {
        onSuccess: () => navigate({ to: '/' }),
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

  if (step === 'account-secret') {
    if (!accountSecret) return null
    return (
      <RegisterAccountSecretStep
        accountSecret={accountSecret}
        isSubmitting={register.isPending}
        error={errorMessage}
        onBack={() => setStep('confirm')}
        onContinue={handleCreate}
      />
    )
  }

  return (
    <RegisterRecoveryConfirmStep
      mnemonic={mnemonic}
      isSubmitting={register.isPending}
      error={errorMessage}
      onBack={() => setStep('recovery')}
      onConfirmed={() => setStep('account-secret')}
    />
  )
}
