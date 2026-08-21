import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Icon } from '../../shared/components/icon'
import { SearchBar } from '../../shared/components/search-bar'
import { analytics } from '../../shared/lib/analytics'
import { HOVERABLE_CARD_CLASSES } from '../../shared/lib/styles'
import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
  ENTRY_TYPE_CREDENTIAL,
  EntryIcon,
  normalizeEntryType,
  useVaultEncryptedAssetUrl,
} from '../vaults'
import {
  useGlobalSearch,
  useRecentLocalEntries,
  type SearchResultItem,
  type SearchResultType,
} from './use-global-search'

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2
/** How many recent entries fill the dropdown before the user starts typing. */
const RECENT_LIMIT = 5

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/i.test(navigator.platform)
/** Focus hint shown in the field; the matching handler lives in a keydown effect. */
const SHORTCUT_LABEL = IS_MAC ? '⌘K' : 'Ctrl K'

interface TypeBadge {
  /** Fallback glyph when the item carries no custom icon. */
  icon: string
  color: string
  labelKey: string
}

/** Per-type badge glyph + colour. Colours map to design tokens, never hex. */
const TYPE_BADGES: Record<SearchResultType, TypeBadge> = {
  agent: { icon: 'smart_toy', color: 'var(--cv-primary)', labelKey: 'search.typeBadge.agent' },
  member: { icon: 'person', color: 'var(--cv-info)', labelKey: 'search.typeBadge.member' },
  vault: { icon: 'shield', color: 'var(--cv-t2)', labelKey: 'search.typeBadge.vault' },
  entry: { icon: 'key', color: 'var(--cv-t2)', labelKey: 'search.typeBadge.entry' },
}

const ENCRYPTED_ASSET_REFERENCE =
  /^vault-asset:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/

function SearchResultIcon({ item }: { item: SearchResultItem }) {
  const badge = TYPE_BADGES[item.type]
  const presentationItem = item.type === 'entry' || item.type === 'vault' ? item : null
  const encryptedAssetId = ENCRYPTED_ASSET_REFERENCE.exec(presentationItem?.icon ?? '')?.[1] ?? null
  const vaultId = item.type === 'entry' ? item.vaultId : item.type === 'vault' ? item.id : ''
  const entryId = item.type === 'entry' ? item.id : undefined
  const encryptedAsset = useVaultEncryptedAssetUrl(vaultId, encryptedAssetId, entryId)
  const resolvedIcon = encryptedAssetId ? encryptedAsset.url : presentationItem?.icon

  if (item.type === 'entry') {
    return (
      <EntryIcon
        icon={resolvedIcon}
        type={normalizeEntryType(item.entryType)}
        color={item.color}
      />
    )
  }
  if (item.type === 'vault') {
    return (
      <EntryIcon
        icon={resolvedIcon ?? DEFAULT_VAULT_ICON}
        type={ENTRY_TYPE_CREDENTIAL}
        color={item.color ?? DEFAULT_VAULT_COLOR}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full
        border border-[var(--cv-border)] bg-[var(--cv-input-bg)]"
    >
      <Icon name={badge.icon} size={16} color={badge.color} />
    </span>
  )
}

export interface GlobalSearchAutocompleteProps {
  placeholder?: string
  /** Wrapper class — pass `flex-1` to fill an inline header row. */
  className?: string
}

/**
 * Global search field with a live autocomplete dropdown. Owns the input state,
 * debounces it, and renders a keyboard-navigable result list below the shared
 * `SearchBar`. Focusing the empty field surfaces the caller's most recent
 * entries from the synchronized index; typing 2+ characters merges local
 * Vault/Entry matches with an ephemeral administrative Member/Agent request.
 */
export function GlobalSearchAutocomplete({
  placeholder,
  className,
}: GlobalSearchAutocompleteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
  const search = useGlobalSearch(debounced)
  const recent = useRecentLocalEntries(RECENT_LIMIT)
  const isDebouncing = isSearching && debounced.trim() !== trimmed

  useEffect(() => {
    if (!search.isLocked) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setQuery('')
      setDebounced('')
      setActiveIndex(-1)
    })
    return () => { active = false }
  }, [search.isLocked])

  const results: SearchResultItem[] = isSearching
    ? (isDebouncing ? [] : search.data)
    : recent

  const isLoading = isSearching
    ? (isDebouncing || search.isRemoteLoading) && results.length === 0
    : false

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

  // Global focus hotkey: ⌘K / Ctrl+K jumps into the search field from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleChange(next: string) {
    if (search.isLocked) {
      setOpen(true)
      return
    }
    setQuery(next)
    setActiveIndex(-1)
    setOpen(true)
  }

  function handleSelect(item: SearchResultItem) {
    analytics.capture('search', 'search-result-selected', { type: item.type, id: item.id })
    setOpen(false)
    setQuery('')

    if (item.type === 'agent') {
      void navigate({ to: '/agents/$agentId', params: { agentId: item.id } })
      return
    }
    if (item.type === 'member') {
      void navigate({ to: '/settings/team' })
      return
    }
    if (item.type === 'vault') {
      void navigate({ to: '/vaults/$vaultId', params: { vaultId: item.id } })
      return
    }
    void navigate({
      to: '/vaults/$vaultId/entries/$entryId',
      params: { vaultId: item.vaultId, entryId: item.id },
    })
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

  const emptyMessage = search.isLocked
    ? t('search.locked')
    : search.isSyncing
      ? t('search.syncing')
      : isSearching && search.isRemoteError
        ? t('search.remoteUnavailable')
        : isSearching ? t('search.noResults') : t('search.startTyping')

  return (
    <div
      ref={containerRef}
      className={`relative${className ? ` ${className}` : ''}`}
      onKeyDown={handleKeyDown}
      onFocus={() => setOpen(true)}
    >
      <SearchBar
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        className=""
        inputRef={inputRef}
        trailing={
          <kbd
            className="pointer-events-none hidden shrink-0 select-none rounded-md border
              border-[var(--cv-input-border)] bg-[var(--cv-card-hover)] px-2 py-1 text-meta
              font-semibold leading-none text-[var(--cv-t2)] sm:inline-block"
          >
            {SHORTCUT_LABEL}
          </kbd>
        }
      />

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl
            border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] p-1 shadow-xl"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-meta text-[var(--cv-t3)]">
              <Icon name="progress_activity" size={16} className="animate-spin" />
              {t('search.loading')}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2.5 text-meta text-[var(--cv-t3)]">{emptyMessage}</div>
          ) : (
            <>
              {!isSearching && (
                <div className="px-3 pb-1 pt-1.5 text-meta font-semibold text-[var(--cv-t3)]">
                  {t('search.recent')}
                </div>
              )}
              {results.map((item, index) => {
                const badge = TYPE_BADGES[item.type]
                const subtitle = item.type === 'entry' ? item.vaultName : null
                return (
                  <button
                    key={item.type === 'entry' ? `entry:${item.vaultId}:${item.id}` : `${item.type}:${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`${HOVERABLE_CARD_CLASSES} flex w-full items-center gap-3 rounded-lg
                      border-transparent px-2.5 py-2 text-left ${
                        index === activeIndex ? 'bg-[var(--cv-card-hover)]' : ''
                      }`}
                  >
                    <SearchResultIcon item={item} />

                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-heading-sm font-medium text-[var(--cv-t1)]">
                        {item.name}
                      </span>
                      {subtitle && (
                        <span className="truncate text-meta text-[var(--cv-t3)]">{subtitle}</span>
                      )}
                    </span>

                    <span
                      className="ml-auto shrink-0 rounded-md border border-[var(--cv-border)] px-1.5
                        py-0.5 text-micro font-semibold"
                      style={{ color: badge.color }}
                    >
                      {t(badge.labelKey)}
                    </span>
                  </button>
                )
              })}
              {isSearching && search.isRemoteLoading && (
                <div className="flex items-center gap-2 px-3 py-2 text-meta text-[var(--cv-t3)]">
                  <Icon name="progress_activity" size={14} className="animate-spin" />
                  {t('search.searchingDirectory')}
                </div>
              )}
              {isSearching && search.isRemoteError && (
                <div className="px-3 py-2 text-meta text-[var(--cv-warning)]">
                  {t('search.remoteUnavailableLocalShown')}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
