import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FieldFeedback, FormInput } from '../../shared/components/form-field'
import { analytics } from '../../shared/lib/analytics'
import { useAuthStore } from '../auth'
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
  }, [isVaultLocked, navigate])

  useEffect(() => {
    analytics.capture('unlock', 'page-viewed')
  }, [])

  if (account.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#6B7A8E]">{t('common.loading')}</p>
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
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isPending = unlock.isPending
  const hasError = errorMessage !== null

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending || password.length === 0) return

    setErrorMessage(null)
    unlock.mutate(password, {
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
          'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)',
      }}
    >
      <div className="w-full max-w-[440px] px-6">
        <div className="text-center">
          <img
            src="/logo.png"
            alt={t('auth.appName')}
            className="mx-auto mb-4 h-16 w-16"
          />
          <h1 className="mb-1 text-[28px] font-bold leading-tight text-[#FDF9E4]">
            {t('unlock.title')}
          </h1>
          <p className="mb-7 text-[13px] text-[#6B7A8E]">
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
                  ? 'border-[#FF4F4F] focus:border-[#FF4F4F]'
                  : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]'
              }
            />
            <FieldFeedback visible={hasError} color="red">
              {errorMessage}
            </FieldFeedback>
          </div>

          <button
            type="submit"
            disabled={isPending || password.length === 0}
            className="mt-2 w-full rounded-lg bg-[#FF4F4F] px-4 py-2.5 text-sm font-semibold text-white
              transition-colors hover:bg-[#e04545]
              disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? t('unlock.unlocking') : t('unlock.button')}
          </button>

          <div className="mt-3 text-center">
            <Link
              to="/recovery"
              className="text-[12px] text-[#6B7A8E] transition-colors hover:text-[#FDF9E4]"
            >
              {t('unlock.forgotPassword')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
