import { useState, type ReactNode } from 'react'
import { Icon } from '../../../shared/components/icon'

export interface VaultSearchBarProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /** Optional filter chips rendered in the collapsible drawer below. */
  filters?: ReactNode
}

/**
 * Search input + optional filter drawer used across vault screens
 * (vault list, detail entries, detail agents). Mirrors the Astro
 * `VaultSearchBar.astro` design: rounded card with a leading magnifier
 * glyph, a borderless input, and a trailing `tune` glyph that toggles
 * the filters drawer. The toggle glyph turns accent red when open.
 */
export function VaultSearchBar({
  value,
  onChange,
  placeholder,
  filters,
}: VaultSearchBarProps) {
  const [open, setOpen] = useState(false)
  const showToggle = filters !== undefined

  return (
    <div className="mb-3">
      <div
        className="flex items-center gap-2.5 rounded-xl border border-[rgba(253,249,228,0.08)]
          bg-[rgba(13,27,62,0.6)] px-3.5 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
      >
        <Icon name="search" size={18} color="#8A95A6" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border-none bg-transparent text-[12px] text-[#FDF9E4]
            placeholder:text-[#8A95A6] focus:outline-none"
        />
        {showToggle ? (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-pressed={open}
            aria-label={open ? 'Hide filters' : 'Show filters'}
            className="flex items-center justify-center"
          >
            <Icon name="tune" size={16} color={open ? '#FF4F4F' : '#8A95A6'} />
          </button>
        ) : null}
      </div>
      {showToggle && open ? (
        <div className="mt-2 flex flex-wrap gap-1.5">{filters}</div>
      ) : null}
    </div>
  )
}
