import { useId, useState } from 'react'
import { Icon } from '../../../shared/components/icon'

export interface ComboboxOption {
  id: string
  /** Primary label. */
  label: string
  /** Optional muted secondary line (e.g. vault name for an entry). */
  sublabel?: string | null
}

export interface EntityComboboxProps {
  label: string
  placeholder: string
  /** Free-text query (controlled). */
  query: string
  onQueryChange: (text: string) => void
  /** Options to show in the dropdown (already filtered for sync lists). */
  options: ComboboxOption[]
  /** Currently selected option label, shown when nothing is being typed. */
  selectedLabel?: string | null
  onSelect: (option: ComboboxOption) => void
  disabled?: boolean
  /** Shown under the field when there are no options for a non-empty query. */
  emptyText?: string
  loading?: boolean
}

/**
 * Generic single-select combobox for grant subjects (agent / vault / entry).
 * Mirrors the agent-type combobox pattern: raw input (per CLAUDE.md class),
 * dropdown of options, mouse-down select. Caller owns filtering/fetching so the
 * same component serves sync lists and async search.
 */
export function EntityCombobox({
  label,
  placeholder,
  query,
  onQueryChange,
  options,
  selectedLabel,
  onSelect,
  disabled,
  emptyText,
  loading,
}: EntityComboboxProps) {
  const inputId = useId()
  const listId = useId()
  const [open, setOpen] = useState(false)

  // Show the selected label as the input value when present and not actively
  // editing (query empty). Otherwise show what the user is typing.
  const inputValue = query.length > 0 ? query : (selectedLabel ?? '')

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          value={inputValue}
          onChange={(e) => {
            onQueryChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-lg border border-[var(--cv-input-border)]
            bg-[var(--cv-input-bg)] px-3 py-2 pr-9 text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)]
            focus:border-[var(--cv-t1)] focus:outline-none transition-colors
            disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Icon name="expand_more" size={16} color="var(--cv-t3)" />
        </div>

        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto
              rounded-lg border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1
              shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          >
            {loading ? (
              <li className="px-3 py-2 text-[12px] text-[var(--cv-t3)]">…</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-[var(--cv-t3)]">
                {emptyText ?? '—'}
              </li>
            ) : (
              options.map((option) => (
                <li key={option.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelect(option)
                      setOpen(false)
                    }}
                    className="flex w-full flex-col px-3 py-2 text-left
                      transition-colors hover:bg-[var(--cv-list-item-hover)]"
                  >
                    <span className="text-[12px] text-[var(--cv-t1)]">{option.label}</span>
                    {option.sublabel && (
                      <span className="text-[10px] text-[var(--cv-t3)]">
                        {option.sublabel}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
