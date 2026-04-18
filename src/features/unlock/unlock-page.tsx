import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FieldFeedback, FormInput } from '../../shared/components/form-field'
import { analytics } from '../../shared/lib/analytics'
import { IncorrectMasterPasswordError, useUnlock } from './use-unlock'

/**
 * Screen shown whenever the user is authenticated but the vault is locked
 * (e.g. fresh login, manual lock, page reload). Runs the Argon2 + libsodium
 * unlock dance and, on success, routes to the dashboard.
 */
export function UnlockPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const unlock = useUnlock()
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    analytics.capture('unlock', 'page-viewed')
  }, [])

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
      className="flex min-h-screen items-center justify-center"
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
          <FormInput
            id="unlock-password"
            label={t('unlock.passwordLabel')}
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              // Clear the inline error as soon as the user starts correcting
              // it — no need to make them re-read the message while typing.
              if (errorMessage) setErrorMessage(null)
            }}
            placeholder={t('unlock.passwordPlaceholder')}
            disabled={isPending}
            borderClass={
              hasError
                ? 'border-[#FF4F4F] focus:border-[#FF4F4F]'
                : 'border-[rgba(253,249,228,0.1)] focus:border-[#2EC4B6]'
            }
          />
          <FieldFeedback visible={hasError} color="red">
            {errorMessage}
          </FieldFeedback>

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
            <button
              type="button"
              className="text-[12px] text-[#6B7A8E] transition-colors hover:text-[#FDF9E4]"
            >
              {t('unlock.forgotPassword')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
