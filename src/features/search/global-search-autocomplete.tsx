import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Icon } from '../../shared/components/icon'
import { SearchBar } from '../../shared/components/search-bar'
import { analytics } from '../../shared/lib/analytics'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { HOVERABLE_CARD_CLASSES } from '../../shared/lib/styles'
import { useAuthStore } from '../auth'
import { type EntrySearchItem, useRecentEntries } from '../grants'
import type { SearchResultItem, SearchResultType } from './search-api'
import { useGlobalSearch } from './use-global-search'

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2
/** How many recent entries fill the dropdown before the user starts typing. */
const RECENT_LIMIT = 5

interface TypeBadge {
  icon: string
  color: string
  labelKey: string
}

/** Per-type badge glyph + colour. Colours map to design tokens, never hex. */
const TYPE_BADGES: Record<SearchResultType, TypeBadge> = {
  agent: { icon: 'smart_toy', color: 'var(--cv-primary)', labelKey: 'search.typeBadge.agent' },
  vault: { icon: 'shield', color: 'var(--cv-t2)', labelKey: 'search.typeBadge.vault' },
  entry: { icon: 'key', color: 'var(--cv-t2)', labelKey: 'search.typeBadge.entry' },
}

export interface GlobalSearchAutocompleteProps {
  placeholder?: string
  /** Wrapper class — pass `flex-1` to fill an inline header row. */
  className?: string
}

/** Recent-entry metadata → the flat search-result shape the dropdown renders. */
function recentEntryToResult(entry: EntrySearchItem): SearchResultItem {
  return {
    type: 'entry',
    id: entry.id,
    name: entry.label,
    vaultId: entry.vaultId,
    vaultName: entry.vaultName ?? undefined,
    icon: entry.icon ?? undefined,
  }
}

/**
 * Global search field with a live autocomplete dropdown. Owns the input state,
 * debounces it, and renders a keyboard-navigable result list below the shared
 * `SearchBar`. Focusing the empty field surfaces the caller's most recent
 * entries (metadata only — no secrets); typing 2+ characters switches to the
 * backend typeahead across agents, vaults, and entries. Selecting a hit
 * navigates to the matching detail screen.
 */
export function GlobalSearchAutocomplete({
  placeholder,
  className,
}: GlobalSearchAutocompleteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const permissions = useAuthStore((s) => s.permissions)

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [query])

  const trimmed = query.trim()
  const isSearching = trimmed.length >= MIN_QUERY_LENGTH
  // Recent entries come from `GET /api/entries`, which requires GrantManage — mirror the
  // dashboard widget's gating so a lower-privilege caller never triggers a 403.
  const canViewRecent = (permissions & PERMISSION_GRANT_MANAGE) !== 0

  const search = useGlobalSearch(debounced)
  const recent = useRecentEntries(RECENT_LIMIT, open && !isSearching && canViewRecent)

  const results: SearchResultItem[] = isSearching
    ? (search.data ?? [])
    : (recent.data ?? []).map(recentEntryToResult)

  const isLoading = isSearching
    ? search.isFetching && results.length === 0
    : recent.isPending && open && canViewRecent

  // Close on outside click.
  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function handleChange(next: string) {
    setQuery(next)
    setActiveIndex(-1)
    setOpen(true)
  }

  function handleSelect(item: SearchResultItem) {
    analytics.capture('identity', 'search-result-selected', { type: item.type, id: item.id })
    setOpen(false)
    setQuery('')

    if (item.type === 'agent') {
      void navigate({ to: '/agents/$agentId', params: { agentId: item.id } })
      return
    }
    if (item.type === 'vault') {
      void navigate({ to: '/vaults/$vaultId', params: { vaultId: item.id } })
      return
    }
    if (item.vaultId) {
      void navigate({
        to: '/vaults/$vaultId/entries/$entryId',
        params: { vaultId: item.vaultId, entryId: item.id },
      })
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      const item = results[activeIndex]
      if (item) {
        event.preventDefault()
        handleSelect(item)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const emptyMessage = isSearching ? t('search.noResults') : t('search.startTyping')

  return (
    <div
      ref={containerRef}
      className={`relative${className ? ` ${className}` : ''}`}
      onKeyDown={handleKeyDown}
      onFocus={() => setOpen(true)}
    >
      <SearchBar value={query} onChange={handleChange} placeholder={placeholder} className="" />

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl
            border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-1 shadow-lg"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-[var(--cv-t3)]">
              <Icon name="progress_activity" size={16} className="animate-spin" />
              {t('search.loading')}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-[var(--cv-t3)]">{emptyMessage}</div>
          ) : (
            <>
              {!isSearching && (
                <div
                  className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide
                    text-[var(--cv-t3)]"
                >
                  {t('search.recent')}
                </div>
              )}
              {results.map((item, index) => {
                const badge = TYPE_BADGES[item.type]
                return (
                  <button
                    key={`${item.type}:${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`${HOVERABLE_CARD_CLASSES} flex w-full items-center gap-2.5 rounded-lg
                      border-transparent px-3 py-2 text-left ${
                        index === activeIndex ? 'bg-[var(--cv-card-hover)]' : ''
                      }`}
                  >
                    <span
                      className="flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase
                        tracking-wide"
                      style={{ color: badge.color }}
                    >
                      <Icon name={badge.icon} size={14} color={badge.color} />
                      {t(badge.labelKey)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12px] text-[var(--cv-t1)]">{item.name}</span>
                      {item.type === 'entry' && item.vaultName && (
                        <span className="truncate text-[10px] text-[var(--cv-t3)]">
                          {item.vaultName}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
