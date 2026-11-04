import { useAuthStore } from '../stores/auth-store'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  RegisterEmergencyKitStep,
  RegisterRecoveryConfirmStep,
  RegisterRecoveryStep,
} from './components/register-recovery-steps'
import type { EmergencyKitMaterial } from '../../../shared/crypto/secret-key'

type Step = 'credentials' | 'recovery' | 'confirm' | 'kit'

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
  const authenticated = useAuthStore(state => Boolean(state.accessToken || state.sessionId))
  const locked = useAuthStore(state => state.isVaultLocked)
  const checking = useAuthStore(state => state.sessionRevalidating)
  const navigated = useRef(false)
  const [kit, setKit] = useState<EmergencyKitMaterial | null>(null)

  useEffect(() => {
    // The Emergency Kit step gates completion of a fresh registration.
    if (!authenticated || checking || register.isPending || register.isSuccess || kit || navigated.current) return
    navigated.current = true
    if (locked) void navigate({ to: '/unlock', search: { redirect: destination ?? '/' }, replace: true })
    else void navigate({ href: destination ?? '/', replace: true })
  }, [authenticated, locked, checking, register.isPending, register.isSuccess, kit, navigate, destination])

  const [step, setStep] = useState<Step>('credentials')
  const finish = () => {
    if (navigated.current) return
    navigated.current = true
    setKit(null)
    void (destination ? navigate({ href: destination }) : navigate({ to: '/' }))
  }
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
        onSuccess: (material) => {
          setKit(material)
          setStep('kit')
        },
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

  if (step === 'kit' && kit) {
    return <RegisterEmergencyKitStep kit={kit} onContinue={finish} />
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
