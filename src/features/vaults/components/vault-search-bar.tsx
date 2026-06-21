import type { ReactNode } from 'react'
import { Icon } from '../../../shared/components/icon'

export interface VaultSearchBarProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /** Optional filter chips rendered inline below the search input. */
  filters?: ReactNode
}

/**
 * Search input + optional inline filter chips used across vault screens
 * (vault list, detail entries, detail agents): a rounded card with a leading
 * magnifier glyph and a borderless input. When `filters` are provided they sit
 * directly below — always visible, no toggle.
 */
export function VaultSearchBar({
  value,
  onChange,
  placeholder,
  filters,
}: VaultSearchBarProps) {
  return (
    <div className="mb-3">
      <div
        className="flex items-center gap-2 rounded-lg border border-[var(--cv-input-border)]
          bg-[var(--cv-input-bg)] px-3 py-2 transition-colors focus-within:border-[var(--cv-t1)]"
      >
        <Icon name="search" size={16} className="shrink-0 text-[var(--cv-input-placeholder)]" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border-none bg-transparent text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
        />
      </div>
      {filters ? (
        <div className="mt-2 flex flex-wrap gap-1.5">{filters}</div>
      ) : null}
    </div>
  )
}
