import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { analytics } from '../../../shared/lib/analytics'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { pickVerificationIndices } from '../../../shared/lib/mnemonic'
import { OnboardingShell } from './onboarding-shell'

export interface RecoveryKeyConfirmStepProps {
  mnemonic: string[]
  onConfirmed: () => void
  onBack: () => void
  isSubmitting: boolean
  error: string | null
}

export function RecoveryKeyConfirmStep({
  mnemonic,
  onConfirmed,
  onBack,
  isSubmitting,
  error,
}: RecoveryKeyConfirmStepProps) {
  const { t } = useTranslation()
  const indicesToVerify = useMemo(
    () => pickVerificationIndices(mnemonic.length),
    [mnemonic.length],
  )

  const [inputs, setInputs] = useState<string[]>(() =>
    indicesToVerify.map(() => ''),
  )

  const correctness = indicesToVerify.map((mnemonicIndex, inputIndex) => {
    const entered = inputs[inputIndex]?.trim().toLowerCase() ?? ''
    if (entered.length === 0) return 'empty' as const
    return entered === mnemonic[mnemonicIndex] ? 'correct' : 'wrong'
  })

  // Reveal one field at a time: a field shows only once every word before it is
  // correct. The next field (or the submit button, once all are correct) slides
  // in — that reveal is itself the "correct" signal, so no per-field tick needed.
  const firstUnsolved = correctness.findIndex((state) => state !== 'correct')
  const correctCount = firstUnsolved === -1 ? correctness.length : firstUnsolved
  const visibleCount = Math.min(correctCount + 1, indicesToVerify.length)
  const allCorrect = correctCount === indicesToVerify.length

  const analyticsFiredRef = useRef(false)
  useEffect(() => {
    if (allCorrect && !analyticsFiredRef.current) {
      analytics.capture('onboarding', 'recovery-key-confirmed')
      analyticsFiredRef.current = true
    }
  }, [allCorrect])

  return (
    <OnboardingShell
      title={t('onboarding.confirmTitle')}
      subtitle={t('onboarding.confirmSubtitle')}
      stepIndex={2}
      totalSteps={3}
      onBack={onBack}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (allCorrect && !isSubmitting) {
            onConfirmed()
          }
        }}
      >
        {indicesToVerify.slice(0, visibleCount).map((mnemonicIndex, inputIndex) => {
          const state = correctness[inputIndex]
          const inputId = `recovery-word-${mnemonicIndex}`
          return (
            <div key={mnemonicIndex} className="step-enter -mb-3">
              <FormInput
                id={inputId}
                label={t('onboarding.confirmWordLabel', { index: mnemonicIndex + 1 })}
                labelClassName="mb-1 block text-xs font-medium text-[#FDF9E4]"
                type="text"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={inputs[inputIndex]}
                onChange={(e) => {
                  const next = [...inputs]
                  next[inputIndex] = e.target.value
                  setInputs(next)
                }}
                borderClass={borderClassForState(state)}
                placeholder={t('onboarding.confirmWordPlaceholder', { index: mnemonicIndex + 1 })}
              />
              <FieldFeedback visible={state === 'wrong'} color="red">
                {t('onboarding.confirmIncorrect')}
              </FieldFeedback>
            </div>
          )
        })}

        <FieldFeedback visible={error !== null} color="red">
          {error}
        </FieldFeedback>

        {allCorrect && (
          <AuthSubmitButton className="step-enter" disabled={isSubmitting}>
            <Check size={14} />
            {isSubmitting ? t('onboarding.finishingSetup') : t('onboarding.verifyAndComplete')}
          </AuthSubmitButton>
        )}
      </form>
    </OnboardingShell>
  )
}

type WordState = 'empty' | 'correct' | 'wrong'

function borderClassForState(state: WordState): string {
  if (state === 'correct') return 'border-[#2EC4B6] focus:border-[#2EC4B6]'
  if (state === 'wrong') return 'border-[#FF4F4F] focus:border-[#FF4F4F]'
  return 'border-[rgba(253,249,228,0.1)] focus:border-[#2EC4B6]'
}
