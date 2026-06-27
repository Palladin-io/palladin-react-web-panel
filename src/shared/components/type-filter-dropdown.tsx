import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './icon'

export interface TypeFilterOption {
  value: string
  label: string
}

export interface TypeFilterDropdownProps {
  options: TypeFilterOption[]
  /** Selected values; empty set = no filter. */
  selected: Set<string>
  onChange: (next: Set<string>) => void
  /** Trigger label when nothing is selected; gains a `(n)` suffix when active. */
  placeholder: string
  /** Accessible name for the trigger (when the visible label isn't specific enough). */
  ariaLabel?: string
  /** Sizing for the trigger (e.g. `h-full` in the inbox header, `h-8` in filter rows). */
  triggerClassName?: string
}

/**
 * Shared multi-select filter dropdown — extracted from the Inbox type filter so
 * the Audit Log and Notification Center use one control. A `filter_list` button
 * shows the placeholder (with a `(n)` count when active) and opens a checkbox
 * listbox (`aria-multiselectable`) with a Clear row. Closes on outside click.
 */
export function TypeFilterDropdown({
  options,
  selected,
  onChange,
  placeholder,
  ariaLabel,
  triggerClassName = 'h-full',
}: TypeFilterDropdownProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function toggle(value: string) {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const label =
    selected.size === 0
      ? placeholder
      : t('common.filterCount', { label: placeholder, n: selected.size })

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border border-[var(--cv-input-border)]
          bg-[var(--cv-input-bg)] px-3 text-[12px] text-[var(--cv-t2)]
          transition-colors hover:border-[var(--cv-t1)] ${triggerClassName}`}
      >
        <Icon name="filter_list" size={15} />
        <span className="whitespace-nowrap">{label}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={15} />
      </button>

      {open && (
        <div
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border
            border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1 shadow-xl"
          role="listbox"
          aria-multiselectable
        >
          {options.map((option) => {
            const checked = selected.has(option.value)
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]
                  text-[var(--cv-t1)] transition-colors hover:bg-[var(--cv-bg-subtle)]"
              >
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                  style={{
                    borderColor: checked ? 'var(--cv-primary)' : 'var(--cv-input-border)',
                    background: checked ? 'var(--cv-primary)' : 'transparent',
                  }}
                >
                  {checked && <Icon name="check" size={11} color="#fff" />}
                </span>
                {option.label}
              </button>
            )
          })}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mt-1 w-full border-t border-[var(--cv-divider)] px-3 py-1.5
                text-left text-[11px] text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
            >
              {t('common.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
