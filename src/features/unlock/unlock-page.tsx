import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AppWordmark } from '../../shared/components/app-wordmark'
import { RotatingWelcome } from '../../shared/components/rotating-welcome'
import { AuthSubmitButton } from '../../shared/components/auth-submit-button'
import { FieldFeedback, FormInput } from '../../shared/components/form-field'
import { analytics } from '../../shared/lib/analytics'
import { logoutAndReload, useAuthStore } from '../auth'
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
interface UnlockPageProps {
  redirectTo?: string
}

export function UnlockPage({ redirectTo = '/' }: UnlockPageProps) {
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
      navigate({ href: redirectTo })
    }
  }, [account.data?.kdf?.securityVersion, isVaultLocked, navigate, redirectTo])

  useEffect(() => {
    analytics.capture('unlock', 'page-viewed')
  }, [])

  if (account.isPending) {
    return (
      <div className="auth-surface flex min-h-screen items-center justify-center">
        <p className="text-ui text-[var(--cv-auth-muted)]">{t('common.loading')}</p>
      </div>
    )
  }

  // Fail closed: a transport/auth/server failure must never be interpreted as
  // an account that has not configured key material. Rendering onboarding in
  // that state could invite an existing user to overwrite their setup.
  if (account.isError) {
    return (
      <AccountLoadError
        isRetrying={account.isFetching}
        onRetry={() => void account.refetch()}
      />
    )
  }

  // Account has no key material → user needs to set up their master password.
  // Check for salt + encryptedPrivateKey: these are the fields useUnlock
  // actually needs; isOnboarded alone doesn't guarantee they're present.
  // Render the wizard full-screen here (no sidebar — /unlock renders without layout chrome).
  if (!account.data?.salt || !account.data?.encryptedPrivateKey) {
    return <OnboardingWizard />
  }

  return <UnlockForm redirectTo={redirectTo} />
}

function AccountLoadError({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()

  const handleLogout = () => {
    void logoutAndReload('/login', clearPushTokenOnLogout)
  }

  return (
    <div className="auth-surface flex min-h-screen items-center justify-center">
      <div className="w-full max-w-[27.5rem] px-6 text-center">
        <h1 className="mb-2 text-display font-bold leading-tight text-[var(--cv-t1)]">
          {t('unlock.accountLoadErrorTitle')}
        </h1>
        <p className="mb-7 text-heading-sm text-[var(--cv-auth-muted)]">
          {t('unlock.accountLoadErrorDescription')}
        </p>
        <button
          type="button"
          className="flex h-control w-full items-center justify-center rounded-lg bg-[var(--cv-primary)] px-4 text-ui font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isRetrying}
          onClick={onRetry}
        >
          {isRetrying ? t('common.loading') : t('unlock.retry')}
        </button>
        <button
          type="button"
          className="mt-3 text-ui text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]"
          onClick={handleLogout}
        >
          {t('common.logout')}
        </button>
      </div>
    </div>
  )
}

function UnlockForm({ redirectTo }: { redirectTo: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const unlock = useUnlock()
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Same logout flow as the app shell: best-effort push-token cleanup, clear
  // session, redirect to login. The only escape hatch from a locked vault when
  // the master password is lost or the wrong account is signed in.
  const handleLogout = () => {
    void logoutAndReload('/login', clearPushTokenOnLogout)
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
        navigate({ href: redirectTo })
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
    <div className="auth-surface flex min-h-screen items-center justify-center">
      <div className="auth-logo-glow w-full max-w-[27.5rem] px-6">
        <div className="text-center">
          <div className="mb-2 flex justify-center">
            <AppWordmark size="lg" />
          </div>
          <RotatingWelcome className="mb-3" />
          <h2 className="sr-only">{t('unlock.title')}</h2>
          <p className="mb-7 text-heading-sm text-[var(--cv-auth-muted)]">
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
              className="text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]"
            >
              {t('unlock.forgotPassword')}
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]"
            >
              {t('common.logout')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
