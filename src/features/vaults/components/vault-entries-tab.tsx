import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { shortenKey } from '../../../shared/lib/shorten-key'
import type { Vault } from '../types'
import { usePersistedEntriesList } from '../use-entries-list-ui'
import {
  useMemberEntryList,
  type MemberEntryListItem,
  type MemberEntrySort,
} from '../sync/member-entry-list'
import type { MemberEntryState } from '../sync/member-sync-store'
import { CreateEntryModal } from './create-entry-modal'
import { EntryRow } from './entry-row'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SearchBar } from '../../../shared/components/search-bar'
import { EntryIcon } from './entry-icon'

export interface VaultEntriesTabProps {
  vault: Vault
}

/**
 * Entries tab body — search + list of entries (or an empty state if the
 * vault is fresh). Tab actions in the page header (Import / Add Entry) live
 * in `vault-detail-page.tsx`; the tab body still owns its own "Add your first
 * entry" CTA inside the empty state for discoverability when there are zero rows.
 */
export function VaultEntriesTab({ vault }: VaultEntriesTabProps) {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [state, setState] = useState<MemberEntryState>('active')
  const [sort, setSort] = useState<MemberEntrySort>('name-asc')

  // Persist search + scroll per vault so it survives navigating into an entry.
  const { search, setSearch, scrollRef, onScroll } = usePersistedEntriesList(vault.id, true)
  const entries = useMemberEntryList(vault.id, state, search, sort)

  if ((entries.status === 'idle' || entries.status === 'syncing') && entries.vaultStatus === null) {
    return <EntriesLoadingSkeleton />
  }

  const totalCount = entries.counts.active + entries.counts.archived + entries.counts.deleted
  if ((entries.status === 'error' || entries.vaultStatus === 'error') && totalCount === 0) {
    return <ErrorState message={t('vault.entries.syncError')} onRetry={entries.retry} />
  }

  if (totalCount === 0) {
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
    <div className="flex h-full min-h-0 flex-col">
      {entries.status === 'error' || entries.vaultStatus === 'error' ? (
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.06)] px-3 py-2 text-meta text-[var(--cv-t2)]">
          <span>{t('vault.entries.partialSyncError')}</span>
          <Button variant="ghost" size="sm" onClick={entries.retry}>{t('vault.list.retry')}</Button>
        </div>
      ) : null}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t('vault.detail.entriesSearchPlaceholder')}
        className="mb-3 shrink-0"
      />

      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('vault.entries.lifecycleFilter')}>
          {(['active', 'archived', 'deleted'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={state === value}
              onClick={() => setState(value)}
              className={`rounded-full border px-3 py-1.5 text-meta transition-colors ${
                state === value
                  ? 'border-[var(--cv-primary)] bg-[rgb(var(--cv-primary-rgb)/0.12)] text-[var(--cv-primary)]'
                  : 'border-[var(--cv-border)] text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
              }`}
            >
              {t(`vault.entries.state.${value}`)} ({entries.counts[value]})
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as MemberEntrySort)}
          aria-label={t('vault.entries.sort.label')}
          className="h-8 rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-2 text-meta text-[var(--cv-input-text)]"
        >
          <option value="name-asc">{t('vault.entries.sort.nameAsc')}</option>
          <option value="name-desc">{t('vault.entries.sort.nameDesc')}</option>
          <option value="type">{t('vault.entries.sort.type')}</option>
        </select>
      </div>

      <ScrollArea scrollRef={scrollRef} onScroll={onScroll}>
        {entries.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
            bg-[var(--cv-empty-bg)] p-6 text-center text-ui text-[var(--cv-t3)]">
            {t('vault.entries.emptySearch')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.items.map((entry) => entry.state === 'active' && !entry.corrupt ? (
              <EntryRow
                key={entry.id}
                vaultId={vault.id}
                wrappedVK={vault.wrappedVK}
                entry={{
                  id: entry.id,
                  label: entry.label,
                  type: entry.type,
                  icon: entry.icon ?? undefined,
                  createdAt: '',
                  updatedAt: '',
                  accessCount: 0,
                }}
              />
            ) : (
              <LifecycleEntryRow key={entry.id} vaultId={vault.id} entry={entry} />
            ))}
          </div>
        )}
      </ScrollArea>

      <CreateEntryModal
        open={createOpen}
        vault={vault}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  )
}

function LifecycleEntryRow({ vaultId, entry }: { vaultId: string; entry: MemberEntryListItem }) {
  const { t } = useTranslation()
  const content = (
    <>
      <EntryIcon icon={entry.icon ?? undefined} type={entry.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">{entry.label}</p>
        <p className="text-meta text-[var(--cv-t3)]">
          {entry.corrupt
            ? t('vault.entries.corrupt', { id: shortenKey(entry.id) })
            : t(`vault.entries.stateDescription.${entry.state}`)}
        </p>
      </div>
    </>
  )
  const classes = "flex items-center gap-3 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-4 py-2.5"
  return entry.corrupt ? (
    <div className={classes}>{content}</div>
  ) : (
    <Link to="/vaults/$vaultId/entries/$entryId" params={{ vaultId, entryId: entry.id }} className={classes}>
      {content}
    </Link>
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
          bg-[rgba(16,185,129,0.12)] text-[#10B981]"
        aria-hidden
      >
        <Icon name="inbox" size={24} />
      </span>
      <h3 className="text-heading font-bold text-[var(--cv-t1)]">
        {t('vault.entries.emptyTitle')}
      </h3>
      <p className="max-w-xs text-ui text-[var(--cv-t3)]">
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
