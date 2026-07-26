import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'

export interface EmailPasswordFormProps {
  isPending: boolean
  errorMessage: string | null
  onSubmit: (email: string, password: string, accountSecret?: string) => void
  onFieldChange: () => void
}

/**
 * The email + master-password credential form on the login screen. Wrapped by
 * `LoginPage`, which owns the gradient chrome, OAuth buttons, and the step
 * machine. On submit the parent runs the salt → authHash → login handshake.
 */
export function EmailPasswordForm({
  isPending,
  errorMessage,
  onSubmit,
  onFieldChange,
}: EmailPasswordFormProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountSecret, setAccountSecret] = useState('')
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isPending
  const hasError = errorMessage !== null

  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSubmit(email.trim(), password, accountSecret.trim() || undefined)
      }}
    >
      <FormInput
        id="login-email"
        label={t('login.emailLabel')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (hasError) onFieldChange()
        }}
        placeholder={t('login.emailPlaceholder')}
        disabled={isPending}
        error={hasError}
      />

      <div>
        <FormInput
          id="login-password"
          label={t('login.passwordLabel')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (hasError) onFieldChange()
          }}
          placeholder={t('login.passwordPlaceholder')}
          disabled={isPending}
          error={hasError}
        />
        <FieldFeedback visible={hasError} color="red">
          {errorMessage}
        </FieldFeedback>
      </div>

      <div>
        <FormInput
          id="login-account-secret"
          label={t('accountSecret.loginLabel')}
          type="password"
          autoComplete="off"
          value={accountSecret}
          onChange={(event) => {
            setAccountSecret(event.target.value)
            if (hasError) onFieldChange()
          }}
          placeholder={t('accountSecret.loginPlaceholder')}
          disabled={isPending}
          error={hasError}
        />
        <p className="mt-1 text-micro text-[#6B7A8E]">
          {t('accountSecret.loginHint')}
        </p>
      </div>

      <AuthSubmitButton disabled={!canSubmit}>
        {isPending ? t('login.signingIn') : t('login.signIn')}
      </AuthSubmitButton>

      {/* Register is the email path's explicit sign-up (OAuth, below in LoginPage,
          creates its account implicitly). Ghost button so it reads as a distinct
          action, not another provider. */}
      <Link
        to="/register"
        className="flex w-full items-center justify-center rounded-lg border
          border-[rgba(232,234,237,0.14)] bg-transparent px-3.5 py-2.5 text-heading-sm
          font-medium text-[#E8EAED] transition-colors hover:bg-[rgba(232,234,237,0.06)]"
      >
        {t('login.createAccount')}
      </Link>
    </form>
  )
}
