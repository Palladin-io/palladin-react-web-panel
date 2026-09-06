import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'

export interface TotpChallengeStepProps {
  isPending: boolean
  errorMessage: string | null
  onSubmit: (code: string) => void
  onBack: () => void
  onFieldChange: () => void
}

const TOTP_CODE_LENGTH = 6

/**
 * Second login factor. Collects a 6-digit TOTP code, with a fallback to a
 * one-time recovery code. Both are submitted to the same endpoint; the server
 * accepts either. The parent keeps the master password in memory so it can
 * derive the master key once this step clears.
 */
export function TotpChallengeStep({
  isPending,
  errorMessage,
  onSubmit,
  onBack,
  onFieldChange,
}: TotpChallengeStepProps) {
  const { t } = useTranslation()
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const [code, setCode] = useState('')
  const hasError = errorMessage !== null

  const trimmed = code.trim()
  const canSubmit =
    !isPending &&
    (useRecoveryCode ? trimmed.length > 0 : /^\d{6}$/.test(trimmed))

  const handleChange = (raw: string) => {
    // TOTP codes are digits only; recovery codes may contain letters/dashes.
    const next = useRecoveryCode ? raw : raw.replace(/\D/g, '').slice(0, TOTP_CODE_LENGTH)
    setCode(next)
    if (hasError) onFieldChange()
  }

  return (
    <form
      className="flex flex-col gap-3 text-left"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSubmit(trimmed)
      }}
    >
      <div>
        <FormInput
          id="totp-code"
          label={
            useRecoveryCode ? t('totpChallenge.recoveryLabel') : t('totpChallenge.codeLabel')
          }
          type="text"
          inputMode={useRecoveryCode ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoFocus
          monospace
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={
            useRecoveryCode
              ? t('totpChallenge.recoveryPlaceholder')
              : t('totpChallenge.codePlaceholder')
          }
          disabled={isPending}
          error={hasError}
        />
        <FieldFeedback visible={hasError} color="red">
          {errorMessage}
        </FieldFeedback>
      </div>

      <AuthSubmitButton disabled={!canSubmit}>
        {isPending ? t('totpChallenge.verifying') : t('totpChallenge.verify')}
      </AuthSubmitButton>

      <div className="flex flex-col items-center gap-2 text-ui">
        <button
          type="button"
          onClick={() => {
            setUseRecoveryCode((prev) => !prev)
            setCode('')
            if (hasError) onFieldChange()
          }}
          className="text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)]"
        >
          {useRecoveryCode ? t('totpChallenge.useAuthenticator') : t('totpChallenge.useRecoveryCode')}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          className="text-[var(--cv-auth-muted)] transition-colors hover:text-[var(--cv-t1)] disabled:opacity-50"
        >
          {t('common.back')}
        </button>
      </div>
    </form>
  )
}
