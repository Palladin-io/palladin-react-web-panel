import type { ReactNode } from 'react'

interface DialogFooterProps {
  children: ReactNode
}

/**
 * Button row for a dialog footer. Chrome-less by design: it is always placed in
 * `ModalShell`'s `footer` slot, which owns the footer's top divider, padding,
 * and pinned position. DialogFooter only lays out the buttons — wrap Cancel +
 * primary action and apply `flex-1` / `flex-[2]` directly on the buttons for the
 * 1:2 ratio. Footer buttons are `size="sm"` (the app-wide single height).
 *
 * Do NOT add a border, background, or negative margins here — that double-chromes
 * against the ModalShell footer slot (a second divider + an empty band). See
 * `dialogs.md`.
 */
export function DialogFooter({ children }: DialogFooterProps) {
  return <div className="flex items-center gap-2">{children}</div>
}
