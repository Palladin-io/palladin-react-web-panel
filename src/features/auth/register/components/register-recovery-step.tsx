import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthStepShell } from '../../../../shared/components/auth-step-shell'
import { AuthSubmitButton } from '../../../../shared/components/auth-submit-button'
import { FieldFeedback } from '../../../../shared/components/form-field'
import { RecoveryMnemonicPanel } from '../../../../shared/components/recovery-mnemonic-panel'

export interface RegisterRecoveryStepProps {
  mnemonic: string[]
  isSubmitting: boolean
  /** Inline error surfaced after a failed registration attempt. */
  errorMessage: string | null
  onBack: () => void
  onConfirmed: () => void
}

/**
 * Second (final) register step: display the recovery phrase and force an
 * explicit "I've saved it" acknowledgement before the account is created.
 * Without the recovery phrase a lost master password is unrecoverable, so the
 * create button stays disabled until the box is checked.
 */
export function RegisterRecoveryStep({
  mnemonic,
  isSubmitting,
  errorMessage,
  onBack,
  onConfirmed,
}: RegisterRecoveryStepProps) {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)
  const hasError = errorMessage !== null

  return (
    <AuthStepShell
      title={t('register.recoveryTitle')}
      subtitle={t('register.recoverySubtitle')}
      progress={{ current: 1, total: 2 }}
      onBack={isSubmitting ? undefined : onBack}
      backLabel={t('common.back')}
    >
      <div className="flex flex-col gap-3">
        <RecoveryMnemonicPanel mnemonic={mnemonic} />

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={isSubmitting}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--cv-primary)]"
          />
          <span className="text-meta text-[#B8C5D4]">
            {t('register.recoveryAcknowledge')}
          </span>
        </label>

        {hasError && (
          <FieldFeedback visible color="red">
            {errorMessage}
          </FieldFeedback>
        )}

        <AuthSubmitButton
          type="button"
          onClick={onConfirmed}
          disabled={!acknowledged || isSubmitting}
        >
          {isSubmitting ? t('register.creatingAccount') : t('register.createAccount')}
        </AuthSubmitButton>
      </div>
    </AuthStepShell>
  )
}
