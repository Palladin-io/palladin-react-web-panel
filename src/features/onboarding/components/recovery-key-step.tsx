import { useEffect, useState } from 'react'
import { Check, Copy, Download, TriangleAlert } from 'lucide-react'
import { analytics } from '../../../shared/lib/analytics'
import { joinMnemonic } from '../lib/mnemonic'
import { OnboardingShell } from './onboarding-shell'

export interface RecoveryKeyStepProps {
  mnemonic: string[]
  onContinue: () => void
  onBack?: () => void
}

export function RecoveryKeyStep({ mnemonic, onContinue, onBack }: RecoveryKeyStepProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    analytics.capture('onboarding', 'recovery-key-page-viewed')
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinMnemonic(mnemonic))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy recovery key', error)
    }
  }

  const handleExport = () => {
    const content = mnemonic.map((word, i) => `${i + 1}. ${word}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'clawvault-recovery-key.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <OnboardingShell
      title="Save Recovery Key"
      subtitle="Write down these 24 words. Without them, you cannot recover your account."
      stepIndex={1}
      totalSteps={3}
      onBack={onBack}
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-[rgba(253,249,228,0.06)] bg-[rgba(253,249,228,0.04)] p-3">
          <ol className="grid grid-cols-4 gap-2 text-xs text-[#FDF9E4]">
            {mnemonic.map((word, index) => (
              <li
                key={index}
                className="flex items-center gap-1 rounded bg-[rgba(253,249,228,0.04)] px-2 py-1.5"
              >
                <span className="text-[10px] text-[#6B7A8E]">{index + 1}</span>
                <span className="font-mono">{word}</span>
              </li>
            ))}
          </ol>
        </div>

        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-[rgba(255,79,79,0.1)] px-3 py-2"
        >
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[#FF4F4F]" />
          <p className="text-xs text-[#FF4F4F]">
            You cannot recover your vault without this key. Store it safely — save
            offline, and never share it.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg
              border border-[rgba(253,249,228,0.1)] bg-transparent px-3 py-2 text-xs
              font-semibold text-[#FDF9E4] transition-colors hover:bg-[rgba(253,249,228,0.04)]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy to Clipboard'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg
              border border-[rgba(253,249,228,0.1)] bg-transparent px-3 py-2 text-xs
              font-semibold text-[#FDF9E4] transition-colors hover:bg-[rgba(253,249,228,0.04)]"
          >
            <Download size={14} />
            Export as .txt
          </button>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg
            bg-[#FF4F4F] px-4 py-2.5 text-sm font-semibold text-white
            transition-colors hover:bg-[#e04545]"
        >
          <Check size={14} />
          I&apos;ve Saved My Recovery Key
        </button>
      </div>
    </OnboardingShell>
  )
}
