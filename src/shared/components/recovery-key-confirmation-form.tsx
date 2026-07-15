import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { AuthSubmitButton } from './auth-submit-button'
import { FeedbackSlot, FormInput } from './form-field'
import { pickVerificationIndices } from '../lib/mnemonic'

export interface RecoveryKeyConfirmationFormProps {
  mnemonic: string[]
  onConfirmed: () => void
  isSubmitting: boolean
  error: string | null
  onValidated?: () => void
}

/** Shared three-word challenge used by every recovery-key setup flow. */
export function RecoveryKeyConfirmationForm({
  mnemonic,
  onConfirmed,
  isSubmitting,
  error,
  onValidated,
}: RecoveryKeyConfirmationFormProps) {
  const { t } = useTranslation()
  const indicesToVerify = useMemo(
    () => pickVerificationIndices(mnemonic.length),
    [mnemonic.length],
  )

  const [inputs, setInputs] = useState<string[]>(() => indicesToVerify.map(() => ''))

  const correctness = indicesToVerify.map((mnemonicIndex, inputIndex) => {
    const entered = inputs[inputIndex]?.trim().toLowerCase() ?? ''
    if (entered.length === 0) return 'empty' as const
    return entered === mnemonic[mnemonicIndex] ? 'correct' : 'wrong'
  })

  const allCorrect = correctness.every((state) => state === 'correct')
  const validationReportedRef = useRef(false)

  useEffect(() => {
    if (allCorrect && !validationReportedRef.current) {
      onValidated?.()
      validationReportedRef.current = true
    }
  }, [allCorrect, onValidated])

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (allCorrect && !isSubmitting) {
          onConfirmed()
        }
      }}
    >
      {indicesToVerify.map((mnemonicIndex, inputIndex) => {
        const state = correctness[inputIndex]
        const inputId = `recovery-word-${mnemonicIndex}`
        return (
          <div key={mnemonicIndex}>
            <FormInput
              id={inputId}
              label={t('onboarding.confirmWordLabel', { index: mnemonicIndex + 1 })}
              type="text"
              autoFocus={inputIndex === 0}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={inputs[inputIndex]}
              onChange={(event) => {
                const next = [...inputs]
                next[inputIndex] = event.target.value
                setInputs(next)
              }}
              borderClass={borderClassForState(state)}
              placeholder={t('onboarding.confirmWordPlaceholder', {
                index: mnemonicIndex + 1,
              })}
            />
            <FeedbackSlot visible={state === 'wrong'} color="red">
              {t('onboarding.confirmIncorrect')}
            </FeedbackSlot>
          </div>
        )
      })}

      <FeedbackSlot visible={error !== null} color="red">
        {error}
      </FeedbackSlot>

      <AuthSubmitButton disabled={!allCorrect || isSubmitting}>
        <Check size={14} />
        {isSubmitting ? t('onboarding.finishingSetup') : t('onboarding.verifyAndComplete')}
      </AuthSubmitButton>
    </form>
  )
}

type WordState = 'empty' | 'correct' | 'wrong'

function borderClassForState(state: WordState): string {
  if (state === 'correct') {
    return 'border-[var(--cv-success)] focus:border-[var(--cv-success)]'
  }
  if (state === 'wrong') return 'border-[var(--cv-primary)] focus:border-[var(--cv-primary)]'
  return 'border-[var(--cv-input-border)] focus:border-[var(--cv-success)]'
}
