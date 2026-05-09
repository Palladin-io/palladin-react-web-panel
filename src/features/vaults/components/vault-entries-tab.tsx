import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryListItem,
  type EntryType,
  type Vault,
} from '../types'
import { useEntries } from '../use-entries'
import { CreateEntryModal } from './create-entry-modal'
import { EntryRow } from './entry-row'
import { VaultSearchBar } from './vault-search-bar'

export interface VaultEntriesTabProps {
  vault: Vault
}

const ALL_TYPES: EntryType[] = [ENTRY_TYPE_KEY, ENTRY_TYPE_CREDENTIAL]

/**
 * Entries tab body — search + filter chips + list of entries (or an
 * empty state if the vault is fresh). Tab actions in the page header
 * (Import / Add Entry) live in `vault-detail-page.tsx`; the tab body
 * still owns its own "Add your first entry" CTA inside the empty
 * state for discoverability when there are zero rows.
 */
export function VaultEntriesTab({ vault }: VaultEntriesTabProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Set<EntryType>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

  const entries = useEntries(vault.id)
  const items = useMemo(() => entries.data?.items ?? [], [entries.data])

  const filtered = useMemo(
    () => filterEntries(items, search, activeFilters),
    [items, search, activeFilters],
  )

  if (entries.isPending) {
    return <EntriesLoadingSkeleton />
  }

  if (entries.isError) {
    return <ErrorState message={t('vault.errorLoad')} />
  }

  if (items.length === 0) {
    return (
      <>
        <EntriesEmptyState onAdd={() => setCreateOpen(true)} />
        <CreateEntryModal
          open={createOpen}
          vault={vault}
          onClose={() => setCreateOpen(false)}
        />
      </>
    )
  }

  return (
    <>
      <VaultSearchBar
        value={search}
        onChange={setSearch}
        placeholder={t('vault.detail.entriesSearchPlaceholder')}
        filters={
          <EntryFilterChips
            active={activeFilters}
            onToggle={(type) => setActiveFilters((prev) => toggleSet(prev, type))}
          />
        }
      />

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
          bg-[var(--cv-empty-bg)] p-6 text-center text-sm text-[var(--cv-t3)]">
          {t('vault.entries.emptySearch')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--cv-border)]
          bg-[var(--cv-card-bg)]">
          {filtered.map((entry, index) => (
            <EntryRow
              key={entry.id}
              vaultId={vault.id}
              wrappedVK={vault.wrappedVK}
              entry={entry}
              showDivider={index > 0}
            />
          ))}
        </div>
      )}

      <CreateEntryModal
        open={createOpen}
        vault={vault}
        onClose={() => setCreateOpen(false)}
      />
    </>
  )
}

interface EntryFilterChipsProps {
  active: Set<EntryType>
  onToggle: (type: EntryType) => void
}

function EntryFilterChips({ active, onToggle }: EntryFilterChipsProps) {
  const { t } = useTranslation()
  const labels: Record<EntryType, string> = {
    [ENTRY_TYPE_KEY]: t('vault.entries.filterKeys'),
    [ENTRY_TYPE_CREDENTIAL]: t('vault.entries.filterCredentials'),
  }
  const dotColor: Record<EntryType, string> = {
    [ENTRY_TYPE_KEY]: '#2EC4B6',
    [ENTRY_TYPE_CREDENTIAL]: '#60A5FA',
  }
  return (
    <>
      {ALL_TYPES.map((type) => {
        const selected = active.has(type)
        return (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            aria-pressed={selected}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
              text-[11px] transition-colors ${
              selected
                ? 'border-[#FF4F4F] bg-[rgba(255,79,79,0.08)] text-[#FF4F4F]'
                : 'border-[var(--cv-border)] text-[var(--cv-t2)] hover:border-[var(--cv-t3)]'
            }`}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dotColor[type] }}
            />
            {labels[type]}
          </button>
        )
      })}
    </>
  )
}

interface EntriesEmptyStateProps {
  onAdd: () => void
}

function EntriesEmptyState({ onAdd }: EntriesEmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed
        border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-10 text-center"
    >
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-full
          bg-[rgba(46,196,182,0.12)] text-[#2EC4B6]"
        aria-hidden
      >
        <Icon name="inbox" size={24} />
      </span>
      <h3 className="text-[14px] font-bold text-[var(--cv-t1)]">
        {t('vault.entries.emptyTitle')}
      </h3>
      <p className="max-w-xs text-[12px] text-[var(--cv-t3)]">
        {t('vault.entries.emptySubtitle')}
      </p>
      <Button variant="accent" size="sm" icon="add" onClick={onAdd}>
        {t('vault.entries.emptyCta')}
      </Button>
    </div>
  )
}

function EntriesLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}

function filterEntries(
  items: EntryListItem[],
  search: string,
  activeFilters: Set<EntryType>,
): EntryListItem[] {
  const query = search.trim().toLowerCase()
  return items.filter((item) => {
    if (activeFilters.size > 0 && !activeFilters.has(item.type)) {
      return false
    }
    if (!query) return true
    return (
      item.label.toLowerCase().includes(query) ||
      (item.description?.toLowerCase().includes(query) ?? false) ||
      (item.urlDomain?.toLowerCase().includes(query) ?? false)
    )
  })
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}
