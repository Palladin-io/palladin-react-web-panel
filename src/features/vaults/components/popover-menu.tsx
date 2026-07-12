import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

interface Coords {
  left: number
  top: number
}

/**
 * Small popover menu shared by the entry-form field rows, the field-type picker,
 * and the 2FA card. The panel is rendered through a portal to `document.body`
 * with `position: fixed`, so a scrolling/overflow-clipped ancestor (the entry
 * modal's body) can never clip it — the bug the inline-absolute version had.
 * Closes on outside click, Escape, or a scroll of the trigger's container.
 * Purely presentational styling via `--cv-*` tokens.
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
  const [coords, setCoords] = useState<Coords | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Measure the trigger and anchor the fixed-position panel to it, at open time.
  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setCoords({ left: alignLeft ? rect.left : rect.right, top: openUp ? rect.top : rect.bottom })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Any scroll (the modal body scrolls) would detach the fixed panel — close it.
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const transform = `${alignLeft ? '' : 'translateX(-100%)'} ${
    openUp ? 'translateY(calc(-100% - 0.25rem))' : 'translateY(0.25rem)'
  }`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        className={
          triggerClassName ??
          'inline-flex h-6 w-6 items-center justify-center rounded text-[var(--cv-icon-muted)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40'
        }
      >
        {trigger}
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              style={{ position: 'fixed', left: coords.left, top: coords.top, transform }}
              className="z-[100] min-w-[13.125rem] rounded-xl border border-[var(--cv-border)]
                bg-[var(--cv-modal-bg)] p-[0.3125rem] shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
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
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-ui
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
                      <span className="text-meta" style={{ color: entry.hintColor ?? 'var(--cv-t3)' }}>
                        {entry.hint}
                      </span>
                    ) : null}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
