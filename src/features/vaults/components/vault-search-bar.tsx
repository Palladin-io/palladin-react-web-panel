import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const showToggle = filters !== undefined

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
          className="flex-1 border-none bg-transparent text-sm text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
        />
        {showToggle ? (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-pressed={open}
            aria-label={open ? t('vault.list.toggleFiltersHide') : t('vault.list.toggleFiltersShow')}
            className="flex shrink-0 items-center justify-center"
          >
            <Icon name="tune" size={16} color={open ? '#FF4F4F' : undefined} className={open ? '' : 'text-[var(--cv-input-placeholder)]'} />
          </button>
        ) : null}
      </div>
      {showToggle && open ? (
        <div className="mt-2 flex flex-wrap gap-1.5">{filters}</div>
      ) : null}
    </div>
  )
}
