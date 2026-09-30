import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copySecretToClipboard, copyToClipboard } from '../lib/clipboard'
import { Icon } from './icon'
import { toast } from 'sonner'

export interface CopyButtonProps {
  /** Value copied to the clipboard on click. */
  value: string
  /** Accessible label for the idle state. Defaults to `common.copy`. */
  label?: string
  /** Glyph size in px. */
  size?: number
  /** Extra classes appended to the default icon-button styling. */
  className?: string
  /** Copy through the bounded auto-clearing path for secrets. */
  secret?: boolean
  /** Opt-in feedback for public reception; never includes the copied value. */
  feedback?: boolean
}

/**
 * Small icon button that copies `value` to the clipboard and flips its glyph
 * to a check for 2s (mirrors the copy affordance in `generate-api-key-modal`).
 * Copying a secret to the user's own clipboard is fine; the value is never
 * logged or sent anywhere. Disabled when there is nothing to copy.
 */
export function CopyButton({ value, label, size = 16, className, secret = false, feedback = false }: CopyButtonProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  const handleCopy = async () => {
    const ok = await (secret ? copySecretToClipboard(value) : copyToClipboard(value))
    if (!ok) {
      if (feedback) toast.error(t('vault.entries.copyFailed'))
      return
    }
    if (feedback) toast.success(t('common.copiedToClipboard'), { id: 'clipboard-copy' })
    setCopied(true)
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setCopied(false), 2000)
  }

  const ariaLabel = copied ? t('common.copied') : (label ?? t('common.copy'))

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`inline-flex h-action w-action items-center justify-center rounded
        text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]
        disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={size} />
    </button>
  )
}
