import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Download, TriangleAlert } from 'lucide-react'

export interface RecoveryMnemonicPanelProps {
  /** The BIP-39 recovery words to display (typically 24). */
  mnemonic: string[]
  /** Downloaded file name for the export button. */
  exportFileName?: string
}

/**
 * The recovery-phrase display block shared by onboarding and registration:
 * a numbered word grid, a "you can't recover without this" warning, and
 * copy / export-to-txt actions. Presentation only — the surrounding step owns
 * the title, the "I've saved it" confirmation, and analytics.
 *
 * The grid carries `ph-no-capture` so PostHog can never scrape the phrase, even
 * if session recording is ever toggled on.
 */
export function RecoveryMnemonicPanel({
  mnemonic,
  exportFileName = 'palladin-recovery-key.txt',
}: RecoveryMnemonicPanelProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic.join(' '))
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
    link.download = exportFileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-[var(--cv-auth-control-border)] bg-[var(--cv-auth-control-bg)] p-3">
        <ol className="ph-no-capture grid grid-cols-4 gap-2 text-meta text-[var(--cv-t1)]">
          {mnemonic.map((word, index) => (
            <li
              key={index}
              className="flex items-center gap-1 rounded bg-[var(--cv-bg-subtle)] px-2 py-1.5"
            >
              <span className="text-micro text-[var(--cv-auth-muted)]">{index + 1}</span>
              <span className="font-mono">{word}</span>
            </li>
          ))}
        </ol>
      </div>

      <div
        role="alert"
        className="flex items-start gap-2 rounded-lg bg-[rgb(var(--cv-primary-rgb)/0.1)] px-3 py-2"
      >
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[var(--cv-primary)]" />
        <p className="text-meta text-[var(--cv-primary)]">
          {t('recoveryPhrase.warning')}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="auth-glass-button flex flex-1 items-center justify-center gap-1.5 rounded-lg
            border px-3 py-2 text-meta font-semibold"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t('recoveryPhrase.copied') : t('recoveryPhrase.copyToClipboard')}
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="auth-glass-button flex flex-1 items-center justify-center gap-1.5 rounded-lg
            border px-3 py-2 text-meta font-semibold"
        >
          <Download size={14} />
          {t('recoveryPhrase.exportAsTxt')}
        </button>
      </div>
    </div>
  )
}
