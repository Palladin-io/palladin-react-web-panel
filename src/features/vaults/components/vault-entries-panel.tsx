import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
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

export interface VaultEntriesPanelProps {
  vault: Vault
  selectedEntryId: string
}

const ALL_TYPES: EntryType[] = [ENTRY_TYPE_KEY, ENTRY_TYPE_CREDENTIAL]

/**
 * Compact left-side panel of the entry detail split view. Renders a
 * back link to the vault list, the vault title, an Add Entry CTA, and
 * the filterable entry list — highlighting the currently viewed row.
 *
 * Filtering logic mirrors {@link VaultEntriesTab} verbatim so the
 * panel and the full-page tab stay in lockstep. Owns its own
 * `CreateEntryModal` because the right-side panel has no knowledge of
 * the left side's lifecycle.
 */
export function VaultEntriesPanel({ vault, selectedEntryId }: VaultEntriesPanelProps) {
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

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-bold text-[var(--cv-t1)]">{vault.name}</h2>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('vault.entries', { count: items.length })}
          </p>
        </div>
        <Button variant="accent" size="sm" icon="add" onClick={() => setCreateOpen(true)}>
          {t('vault.detail.addEntry')}
        </Button>
      </div>

      {entries.isPending ? (
        <PanelLoadingSkeleton />
      ) : entries.isError ? (
        <ErrorState message={t('vault.errorLoad')} onRetry={entries.refetch} />
      ) : (
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
            <div className="flex flex-col gap-2">
              {filtered.map((entry) => (
                <EntryRow
                  key={entry.id}
                  vaultId={vault.id}
                  wrappedVK={vault.wrappedVK}
                  entry={entry}
                  isSelected={entry.id === selectedEntryId}
                />
              ))}
            </div>
          )}
        </>
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

function PanelLoadingSkeleton() {
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
