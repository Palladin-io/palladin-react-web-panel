import type { ReactNode, Ref } from 'react'
import { Icon } from './icon'

export interface SearchBarProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /**
   * Wrapper class. Defaults to `mb-3` for the stacked list usage (vault list,
   * entries/agents tabs). Pass e.g. `flex-1` to drop the margin and let the bar
   * fill an inline header row.
   */
  className?: string
  /** Forwarded to the underlying input — lets callers focus it (e.g. a hotkey). */
  inputRef?: Ref<HTMLInputElement>
  /** Optional adornment after the input, e.g. a keyboard-shortcut hint. */
  trailing?: ReactNode
}

/**
 * Shared search input: a rounded field with a leading magnifier glyph and a
 * borderless input. Used across vault screens (list, detail entries/agents) and
 * the dashboard header — one control, identical tokens everywhere.
 */
export function SearchBar({
  value,
  onChange,
  placeholder,
  className = 'mb-3',
  inputRef,
  trailing,
}: SearchBarProps) {
  return (
    <div className={className}>
      <div
        className="flex items-center gap-2 rounded-lg border border-[var(--cv-input-border)]
          bg-[var(--cv-input-bg)] px-3 py-2 transition-colors focus-within:border-[var(--cv-t1)]"
      >
        <Icon name="search" size={16} className="shrink-0 text-[var(--cv-input-placeholder)]" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border-none bg-transparent text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
        />
        {trailing}
      </div>
    </div>
  )
}
