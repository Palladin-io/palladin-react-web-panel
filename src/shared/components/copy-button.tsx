import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../lib/clipboard'
import { Icon } from './icon'

export interface CopyButtonProps {
  /** Value copied to the clipboard on click. */
  value: string
  /** Accessible label for the idle state. Defaults to `common.copy`. */
  label?: string
  /** Glyph size in px. */
  size?: number
  /** Extra classes appended to the default icon-button styling. */
  className?: string
}

/**
 * Small icon button that copies `value` to the clipboard and flips its glyph
 * to a check for 2s (mirrors the copy affordance in `generate-api-key-modal`).
 * Copying a secret to the user's own clipboard is fine; the value is never
 * logged or sent anywhere. Disabled when there is nothing to copy.
 */
export function CopyButton({ value, label, size = 15, className }: CopyButtonProps) {
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
    const ok = await copyToClipboard(value)
    if (!ok) return
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
      className={`inline-flex h-7 w-7 items-center justify-center rounded
        text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]
        disabled:cursor-not-allowed disabled:opacity-40 ${className ?? ''}`}
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={size} />
    </button>
  )
}
