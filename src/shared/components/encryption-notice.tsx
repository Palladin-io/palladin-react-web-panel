import type { ReactNode } from 'react'
import { Icon } from './icon'

export interface EncryptionNoticeProps {
  /** The reassurance copy — caller passes its own translated string. */
  children: ReactNode
}

/**
 * Success-tinted callout reassuring the user that data is encrypted client-side
 * before it leaves the device. Shared across the create-entry and import flows
 * so the zero-knowledge message reads identically. Colours come from the
 * `--cv-success` token — never hardcode the green.
 */
export function EncryptionNotice({ children }: EncryptionNoticeProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border
        border-[rgb(var(--cv-success-rgb)/0.25)] bg-[rgb(var(--cv-success-rgb)/0.08)]
        px-3 py-2"
    >
      <Icon
        name="enhanced_encryption"
        size={14}
        className="shrink-0"
        color="var(--cv-success)"
      />
      <span className="text-meta text-[var(--cv-t2)]">{children}</span>
    </div>
  )
}
