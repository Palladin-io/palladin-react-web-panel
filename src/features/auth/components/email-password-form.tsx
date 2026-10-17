import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { parseAuthRedirect } from '../../../shared/lib/auth-redirect'

export interface EmailPasswordFormProps {
  redirectTo?: string
  isPending: boolean
  errorMessage: string | null
  onSubmit: (email: string, password: string) => void
  onFieldChange: () => void
}

/**
 * The email + master-password credential form on the login screen. Wrapped by
 * `LoginPage`, which owns the gradient chrome, OAuth buttons, and the step
 * machine. On submit the parent runs the salt → authHash → login handshake.
 */
export function EmailPasswordForm({
  redirectTo,
  isPending,
  errorMessage,
  onSubmit,
  onFieldChange,
}: EmailPasswordFormProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isPending
  const hasError = errorMessage !== null

  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSubmit(email.trim(), password)
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

      <AuthSubmitButton disabled={!canSubmit}>
        {isPending ? t('login.signingIn') : t('login.signIn')}
      </AuthSubmitButton>

      {/* Register is the email path's explicit sign-up (OAuth, below in LoginPage,
          creates its account implicitly). It shares the same quiet surface as
          the provider actions so secondary auth choices stay visually consistent. */}
      <Link
        to="/register"
        search={{ redirect: parseAuthRedirect(redirectTo) }}
        className="auth-glass-button flex h-control w-full items-center justify-center rounded-lg
          border px-3.5 text-heading-sm font-medium"
      >
        {t('login.createAccount')}
      </Link>
    </form>
  )
}
