import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AuthSubmitButton } from '../../shared/components/auth-submit-button'
import { FieldFeedback, FormInput } from '../../shared/components/form-field'
import { analytics } from '../../shared/lib/analytics'
import { useAuthStore } from '../auth'
import { clearPushTokenOnLogout } from '../notifications'
import { ACCOUNT_QUERY_KEY, getAccount } from '../../shared/api/account-api'
import { OnboardingWizard } from '../onboarding'
import { IncorrectMasterPasswordError, useUnlock } from './use-unlock'

/**
 * Entry point for any vault-locked state. Decides what to show:
 * - Account not set up yet (no key material on server) → OnboardingWizard
 * - Account set up → unlock form
 *
 * Navigates away automatically once isVaultLocked becomes false (set by
 * either the wizard's unlockVault call or the unlock form's success handler).
 */
export function UnlockPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isVaultLocked = useAuthStore((s) => s.isVaultLocked)

  const account = useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })

  // Leave /unlock as soon as the vault is unlocked, regardless of whether
  // it was the wizard or the unlock form that did it.
  useEffect(() => {
    if (!isVaultLocked) {
      navigate({ to: '/' })
    }
  }, [account.data?.kdf?.securityVersion, isVaultLocked, navigate])

  useEffect(() => {
    analytics.capture('unlock', 'page-viewed')
  }, [])

  if (account.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-ui text-[#6B7A8E]">{t('common.loading')}</p>
      </div>
    )
  }

  // Account has no key material → user needs to set up their master password.
  // Check for salt + encryptedPrivateKey: these are the fields useUnlock
  // actually needs; isOnboarded alone doesn't guarantee they're present.
  // Render the wizard full-screen here (no sidebar — /unlock renders without layout chrome).
  if (!account.data?.salt || !account.data?.encryptedPrivateKey) {
    return <OnboardingWizard />
  }

  return <UnlockForm />
}

function UnlockForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const unlock = useUnlock()
  const logout = useAuthStore((s) => s.logout)
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Same logout flow as the app shell: best-effort push-token cleanup, clear
  // session, redirect to login. The only escape hatch from a locked vault when
  // the master password is lost or the wrong account is signed in.
  const handleLogout = () => {
    void clearPushTokenOnLogout()
    logout()
    navigate({ to: '/login' })
  }

  const isPending = unlock.isPending
  const hasError = errorMessage !== null

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending || password.length === 0) return

    setErrorMessage(null)
    unlock.mutate({ password }, {
      onSuccess: () => {
        analytics.capture('unlock', 'vault-unlocked')
        navigate({ to: '/' })
      },
      onError: (err) => {
        analytics.capture('unlock', 'unlock-failed')
        setErrorMessage(
          err instanceof IncorrectMasterPasswordError
            ? t('unlock.errorIncorrect')
            : t('unlock.errorGeneric'),
        )
      },
    })
  }

  return (
    <div
      className="dark flex min-h-screen items-center justify-center"
      style={{
        background:
          'linear-gradient(160deg, #15171B 0%, #212429 30%, #1A1D22 60%, #15171B 100%)',
      }}
    >
      <div className="w-full max-w-[27.5rem] px-6">
        <div className="text-center">
          <img
            src="/logo.png"
            alt={t('auth.appName')}
            className="mx-auto mb-4 h-16 w-16"
          />
          <h1 className="mb-1 text-display font-bold leading-tight text-[#E8EAED]">
            {t('unlock.title')}
          </h1>
          <p className="mb-7 text-heading-sm text-[#6B7A8E]">
            {t('unlock.subtitle')}
          </p>
        </div>

        <form className="flex flex-col" onSubmit={handleSubmit}>
          <div>
            <FormInput
              id="unlock-password"
              label={t('unlock.passwordLabel')}
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errorMessage) setErrorMessage(null)
              }}
              placeholder={t('unlock.passwordPlaceholder')}
              disabled={isPending}
              borderClass={
                hasError
                  ? 'border-[var(--cv-primary)] focus:border-[var(--cv-primary)]'
                  : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]'
              }
            />
            <FieldFeedback visible={hasError} color="red">
              {errorMessage}
            </FieldFeedback>
          </div>

          <AuthSubmitButton disabled={isPending || password.length === 0}>
            {isPending ? t('unlock.unlocking') : t('unlock.button')}
          </AuthSubmitButton>

          <div className="mt-3 flex flex-col items-center gap-2 text-ui">
            <Link
              to="/recovery"
              className="text-[#6B7A8E] transition-colors hover:text-[#E8EAED]"
            >
              {t('unlock.forgotPassword')}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-[#6B7A8E] transition-colors hover:text-[#E8EAED]"
            >
              {t('common.logout')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
