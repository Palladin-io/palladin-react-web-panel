import { Check } from 'lucide-react'
import { AuthSubmitButton } from './auth-submit-button'
import { RecoveryMnemonicPanel } from './recovery-mnemonic-panel'

export interface RecoveryKeyDisplayProps {
  mnemonic: string[]
  continueLabel: string
  onContinue: () => void
}

/** Shared recovery-key display used by every account setup flow. */
export function RecoveryKeyDisplay({
  mnemonic,
  continueLabel,
  onContinue,
}: RecoveryKeyDisplayProps) {
  return (
    <div className="flex flex-col gap-3">
      <RecoveryMnemonicPanel mnemonic={mnemonic} />

      <AuthSubmitButton type="button" onClick={onContinue}>
        <Check size={14} />
        {continueLabel}
      </AuthSubmitButton>
    </div>
  )
}
