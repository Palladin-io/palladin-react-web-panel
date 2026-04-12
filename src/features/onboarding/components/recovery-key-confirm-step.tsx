import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleAlert, CircleCheck } from 'lucide-react'
import { analytics } from '../../../shared/lib/analytics'
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
  // Indices are picked once per mount — re-picking on re-render would
  // swap the quiz under the user's feet.
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

  // Use a ref (not state) so firing the analytics event once doesn't cause
  // a re-render — the effect still dedupes the capture but stays side-only.
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
        className="flex flex-col gap-4"
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
              <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-[#FDF9E4]">
                Word #{mnemonicIndex + 1}
              </label>
              <input
                id={inputId}
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
                className={
                  'w-full rounded-lg border bg-[rgba(253,249,228,0.04)] px-3 py-2.5 text-sm text-[#FDF9E4] ' +
                  'placeholder:text-[#6B7A8E] focus:outline-none ' +
                  borderForState(state)
                }
                placeholder={`Enter word #${mnemonicIndex + 1}`}
              />
              <WordFeedback state={state} />
            </div>
          )
        })}

        {error && (
          <p role="alert" className="text-xs text-[#FF4F4F]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!allCorrect || isSubmitting}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg
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

function borderForState(state: WordState): string {
  if (state === 'correct') return 'border-[#2EC4B6] focus:border-[#2EC4B6]'
  if (state === 'wrong') return 'border-[#FF4F4F] focus:border-[#FF4F4F]'
  return 'border-[rgba(253,249,228,0.1)] focus:border-[#2EC4B6]'
}

function WordFeedback({ state }: { state: WordState }) {
  if (state === 'correct') {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-[#2EC4B6]">
        <CircleCheck size={12} /> Correct
      </p>
    )
  }
  if (state === 'wrong') {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-[#FF4F4F]">
        <CircleAlert size={12} /> Doesn&apos;t match
      </p>
    )
  }
  return null
}
