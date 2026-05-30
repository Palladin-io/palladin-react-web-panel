import type { ReactNode } from 'react'

interface DialogFooterProps {
  children: ReactNode
}

/**
 * Footer strip shared by all modals/dialogs. Bleeds to the ModalShell
 * edges via negative margins, adds a top border, and applies a subtle
 * background tint — mirrors the Approve Agent dialog reference pattern.
 *
 * Usage: wrap Cancel + primary action buttons; apply flex-1 / flex-[2]
 * directly on the buttons for the 1:2 ratio layout.
 */
export function DialogFooter({ children }: DialogFooterProps) {
  return (
    <div
      className="-mx-6 -mb-6 mt-4 flex items-center gap-2
        rounded-b-2xl border-t border-[var(--cv-divider)]
        bg-[rgba(0,11,46,0.015)] px-6 py-4
        dark:bg-[rgba(253,249,228,0.02)]"
    >
      {children}
    </div>
  )
}
