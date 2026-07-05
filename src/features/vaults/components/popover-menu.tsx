import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../../shared/components/icon'

export interface MenuItemSpec {
  icon?: string
  label: string
  /** Right-aligned muted hint (e.g. current value or a description). */
  hint?: string
  /** Override the hint colour (e.g. `var(--cv-info)` for an active toggle). */
  hintColor?: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export type MenuEntry = MenuItemSpec | 'separator'

export interface PopoverMenuProps {
  /** Rendered inside the trigger button. */
  trigger: ReactNode
  items: MenuEntry[]
  ariaLabel?: string
  disabled?: boolean
  /** Extra classes for the trigger button. */
  triggerClassName?: string
  /** Anchor the panel to the left instead of the right edge. */
  alignLeft?: boolean
  /** Open the panel upward (for triggers near the bottom, e.g. "Add field"). */
  openUp?: boolean
}

/**
 * Small popover menu shared by the entry-form field rows, the field-type picker,
 * and the 2FA card. Matches the approved redesign menu (rounded panel on
 * `--menu` surface, icon + label + optional right-aligned hint, danger + divider
 * support). Closes on outside click or Escape. Purely presentational styling via
 * `--cv-*` tokens.
 */
export function PopoverMenu({
  trigger,
  items,
  ariaLabel,
  disabled,
  triggerClassName,
  alignLeft,
  openUp,
}: PopoverMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={
          triggerClassName ??
          'inline-flex h-6 w-6 items-center justify-center rounded text-[var(--cv-icon-muted)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40'
        }
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={`absolute z-30 min-w-[210px] rounded-xl border border-[var(--cv-border)]
            bg-[var(--cv-modal-bg)] p-[5px] shadow-[0_12px_32px_rgba(0,0,0,0.25)]
            ${alignLeft ? 'left-0' : 'right-0'} ${openUp ? 'bottom-full mb-1' : 'mt-1'}`}
        >
          {items.map((entry, i) =>
            entry === 'separator' ? (
              <div key={`sep-${i}`} className="mx-1.5 my-1 h-px bg-[var(--cv-divider)]" />
            ) : (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                onClick={() => {
                  entry.onSelect()
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px]
                  transition-colors hover:bg-[var(--cv-bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40
                  ${entry.danger ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-t1)]'}`}
              >
                {entry.icon ? (
                  <Icon
                    name={entry.icon}
                    size={15}
                    className={entry.danger ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-icon-muted)]'}
                  />
                ) : null}
                <span className="flex-1">{entry.label}</span>
                {entry.hint ? (
                  <span className="text-[11px]" style={{ color: entry.hintColor ?? 'var(--cv-t3)' }}>
                    {entry.hint}
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
