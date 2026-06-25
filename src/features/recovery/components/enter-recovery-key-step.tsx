import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clipboard, FileText } from 'lucide-react'
import { analytics } from '../../../shared/lib/analytics'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { FieldFeedback } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { MNEMONIC_WORD_COUNT } from '../../../shared/lib/mnemonic'
import { RecoveryShell } from './recovery-shell'

export interface EnterRecoveryKeyStepProps {
  initialWords: string[]
  /** Inline error rendered above the submit button (e.g. invalid key). */
  errorMessage: string | null
  onSubmit: (words: string[]) => void
}

/**
 * Normalise a pasted or imported recovery-key blob into a word array.
 *
 * Users paste in wildly different shapes: numbered lines ("1. alpha"),
 * comma-separated, tab-separated, or plain whitespace. We strip punctuation
 * that would never appear in a BIP-39 word, lowercase everything, and split
 * on any run of whitespace.
 */
function parseMnemonicText(raw: string): string[] {
  return raw
    .replace(/[0-9]+\s*[.)]/g, ' ') // "1. ", "1) "
    .replace(/[,;]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

export function EnterRecoveryKeyStep({
  initialWords,
  errorMessage,
  onSubmit,
}: EnterRecoveryKeyStepProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialWords.join(' '))
  const [localError, setLocalError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    analytics.capture('recovery', 'enter-key-page-viewed')
  }, [])

  const words = parseMnemonicText(value)
  const wordCountValid = words.length === MNEMONIC_WORD_COUNT
  const displayedError = localError ?? errorMessage
  const hasError = displayedError !== null

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!wordCountValid) {
      setLocalError(t('recovery.errorWordCount'))
      return
    }
    setLocalError(null)
    onSubmit(words)
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setValue(text)
      setLocalError(null)
    } catch (error) {
      console.error('Failed to read clipboard', error)
    }
  }

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    file
      .text()
      .then((text) => {
        setValue(text)
        setLocalError(null)
      })
      .catch((error) => {
        console.error('Failed to read file', error)
      })
      .finally(() => {
        // Allow re-selecting the same file — input only fires change when
        // the value differs from the previous selection.
        event.target.value = ''
      })
  }

  return (
    <RecoveryShell
      title={t('recovery.enterKeyTitle')}
      subtitle={t('recovery.enterKeySubtitle')}
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <div className="-mb-3">
          <FormTextarea
            id="recovery-key-input"
            label={t('recovery.enterKeyLabel')}
            autoFocus
            rows={4}
            spellCheck={false}
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (localError) setLocalError(null)
            }}
            placeholder={t('recovery.enterKeyPlaceholder')}
            hasError={hasError}
            monospace
          />
          <FieldFeedback visible={hasError} color="red">
            {displayedError}
          </FieldFeedback>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePaste}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg
              border border-[rgba(232, 234, 237,0.1)] bg-transparent px-3 py-2 text-xs
              font-semibold text-[#E8EAED] transition-colors hover:bg-[rgba(232, 234, 237,0.04)]"
          >
            <Clipboard size={14} />
            {t('recovery.pasteFromClipboard')}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg
              border border-[rgba(232, 234, 237,0.1)] bg-transparent px-3 py-2 text-xs
              font-semibold text-[#E8EAED] transition-colors hover:bg-[rgba(232, 234, 237,0.04)]"
          >
            <FileText size={14} />
            {t('recovery.importFromFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleFilePick}
          />
        </div>

        <AuthSubmitButton className="mt-2" disabled={!wordCountValid}>
          {t('recovery.next')}
        </AuthSubmitButton>
      </form>
    </RecoveryShell>
  )
}
