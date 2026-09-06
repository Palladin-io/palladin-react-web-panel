import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { AuthStepShell } from '../../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../../shared/components/auth-submit-button'
import { FeedbackSlot, FormInput } from '../../../../shared/components/form-field'
import { PasswordStrengthBar } from '../../../../shared/components/password-strength-bar'
import { WarningZone } from '../../../../shared/components/warning-zone'
import { checkPasswordPwned } from '../../../../shared/lib/hibp'
import {
  evaluatePasswordStrength,
  isPasswordAcceptable,
} from '../../../../shared/lib/password-strength'

export interface RegisterCredentialsValues {
  email: string
  password: string
}

export interface RegisterCredentialsStepProps {
  initialEmail?: string
  initialPassword?: string
  onContinue: (values: RegisterCredentialsValues) => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RegisterCredentialsStep({
  initialEmail,
  initialPassword,
  onContinue,
}: RegisterCredentialsStepProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState(initialPassword ?? '')
  const [confirm, setConfirm] = useState(initialPassword ?? '')
  // Count of breach occurrences from HIBP: null = unknown/not-checked.
  const [pwnedCount, setPwnedCount] = useState<number | null>(null)

  const { score } = evaluatePasswordStrength(password)
  const emailValid = EMAIL_PATTERN.test(email.trim())
  const passwordsMatch = password.length > 0 && password === confirm
  const canSubmit = emailValid && isPasswordAcceptable(score) && passwordsMatch

  // Advisory breach lookup via HIBP k-anonymity. Debounced; only the SHA-1
  // 5-char prefix ever leaves the browser. Never blocks submission — a breached
  // password is warned about, and lookup failures are treated as "unknown".
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      // Only probe once the password is worth checking; otherwise clear any
      // prior warning. Both branches run inside the debounced callback so no
      // state is set synchronously in the effect body.
      if (!isPasswordAcceptable(score)) {
        setPwnedCount(null)
        return
      }
      const result = await checkPasswordPwned(password, controller.signal)
      if (!controller.signal.aborted) {
        setPwnedCount(result?.pwned ? result.count : null)
      }
    }, 450)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [password, score])

  return (
    <AuthStepShell
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      progress={{ current: 0, total: 3 }}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) onContinue({ email: email.trim(), password })
        }}
      >
        <div>
          <FormInput
            id="register-email"
            label={t('register.emailLabel')}
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('register.emailPlaceholder')}
            error={email.length > 0 && !emailValid}
          />
          <FeedbackSlot visible={email.length > 0 && !emailValid} color="red">
            {t('register.emailInvalid')}
          </FeedbackSlot>
        </div>

        <div>
          <FormInput
            id="register-password"
            label={t('register.passwordLabel')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('register.passwordPlaceholder')}
          />
          <PasswordStrengthBar score={score} />
        </div>

        <div>
          <FormInput
            id="register-password-confirm"
            label={t('register.confirmPasswordLabel')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('register.confirmPasswordPlaceholder')}
            error={confirm.length > 0 && !passwordsMatch}
          />
          <FeedbackSlot visible={confirm.length > 0 && !passwordsMatch} color="red">
            {t('register.passwordsDoNotMatch')}
          </FeedbackSlot>
        </div>

        {pwnedCount !== null && (
          <div className="step-enter">
            <WarningZone title={t('register.pwnedTitle')}>
              {t('register.pwnedBody')}
            </WarningZone>
          </div>
        )}

        <div className="rounded-lg border border-[var(--cv-auth-control-border)] bg-[var(--cv-auth-control-bg)] px-3 py-2">
          <p className="text-meta text-[var(--cv-t1)]">{t('register.encryptionNote')}</p>
        </div>

        <AuthSubmitButton disabled={!canSubmit}>
          {t('register.continue')}
        </AuthSubmitButton>

        <p className="mt-1 text-center text-ui text-[var(--cv-auth-muted)]">
          {t('register.haveAccount')}{' '}
          <Link
            to="/login"
            className="font-semibold text-[var(--cv-t1)] transition-colors hover:text-[var(--cv-primary)]"
          >
            {t('register.signIn')}
          </Link>
        </p>
      </form>
    </AuthStepShell>
  )
}
