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
 * directly on the buttons for the 1:2 ratio layout. Footer buttons are
 * `size="sm"` — the SAME height as every other button in the app (the
 * app-wide single standard); no taller dialog exception. See CLAUDE.md
 * "Modal Footer".
 *
 * Spacing above the footer comes from the dialog body's own `gap` — the footer
 * adds none of its own so it sits one gap below the last field.
 */
export function DialogFooter({ children }: DialogFooterProps) {
  return (
    <div
      className="-mx-6 -mb-6 flex items-center gap-2
        rounded-b-2xl border-t border-[var(--cv-divider)]
        bg-[#E8EBF0] px-6 py-3.5
        dark:bg-[#272C35]"
    >
      {children}
    </div>
  )
}
