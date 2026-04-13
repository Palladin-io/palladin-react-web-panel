import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleAlert, CircleCheck } from 'lucide-react'
import { analytics } from '../../../shared/lib/analytics'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { pickVerificationIndices } from '../lib/mnemonic'
import { OnboardingShell } from './onboarding-shell'

export interface RecoveryKeyConfirmStepProps {
  mnemonic: string[]
  onConfirmed: () => void
  isSubmitting: boolean
  error: string | null
}

export function RecoveryKeyConfirmStep({
  mnemonic,
  onConfirmed,
  isSubmitting,
  error,
}: RecoveryKeyConfirmStepProps) {
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

  const allCorrect = correctness.every((state) => state === 'correct')

  const analyticsFiredRef = useRef(false)
  useEffect(() => {
    if (allCorrect && !analyticsFiredRef.current) {
      analytics.capture('onboarding', 'recovery-key-confirmed')
      analyticsFiredRef.current = true
    }
  }, [allCorrect])

  return (
    <OnboardingShell
      title="Confirm Recovery Key"
      subtitle="Enter the following words from your recovery key to verify you saved it correctly."
      stepIndex={2}
      totalSteps={3}
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
        {indicesToVerify.map((mnemonicIndex, inputIndex) => {
          const state = correctness[inputIndex]
          const inputId = `recovery-word-${mnemonicIndex}`
          return (
            <div key={mnemonicIndex}>
              <FormInput
                id={inputId}
                label={`Word #${mnemonicIndex + 1}`}
                labelClassName="mb-1 block text-xs font-medium text-[#FDF9E4]"
                type="text"
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
                placeholder={`Enter word #${mnemonicIndex + 1}`}
              />
              <FieldFeedback visible={state !== 'empty'} color={state === 'correct' ? 'teal' : 'red'}>
                {state === 'correct' ? (
                  <><CircleCheck size={12} /> Correct</>
                ) : (
                  <><CircleAlert size={12} /> Doesn&apos;t match</>
                )}
              </FieldFeedback>
            </div>
          )
        })}

        {/* Server error — below inputs, always reserves space so button doesn't jump */}
        <div className="relative h-4">
          <p
            role="alert"
            className={`absolute inset-x-0 text-xs leading-4 text-[#FF4F4F] transition-opacity duration-200 ${
              error ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {error ?? ''}
          </p>
        </div>

        <button
          type="submit"
          disabled={!allCorrect || isSubmitting}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg
            bg-[#FF4F4F] px-4 py-2.5 text-sm font-medium text-white
            transition-colors hover:bg-[#e04545]
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check size={14} />
          {isSubmitting ? 'Finishing setup...' : 'Verify & Complete Setup'}
        </button>
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
