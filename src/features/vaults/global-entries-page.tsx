import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchBar } from '../../shared/components/search-bar'
import { ScrollArea } from '../../shared/components/scroll-area'
import { EmptyState } from '../../shared/components/empty-state'
import { ErrorState } from '../../shared/components/error-state'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import { LoadMoreSentinel } from '../../shared/components/load-more-sentinel'
import { ResponsiveMasterDetail } from '../../shared/components/responsive-master-detail'
import { useMemberSyncStore } from './sync/member-sync-store'
import { globalEntries, useGlobalEntriesUi } from './global-entries-model'
import { EntryNavigationRow } from './components/entry-navigation-row'
import { EntryListHeader } from './components/entry-list-header'
import { GlobalCreateEntry } from './components/global-create-entry'

export function GlobalEntriesPage() {
  const { t } = useTranslation()
  return <ResponsiveMasterDetail master={<GlobalEntriesPanel />} hasSelection={false}
    masterLabel={t('entries.title')} detailLabel={t('entries.selectEntry')}
    detail={<div className="flex h-full items-center justify-center p-4 text-ui text-[var(--cv-t3)]">{t('entries.selectEntry')}</div>} />
}

export function GlobalEntriesPanel({ selectedEntryId, selectedVaultId }: { selectedEntryId?: string; selectedVaultId?: string }) {
  const { t } = useTranslation()
  const vaults = useMemberSyncStore((state) => state.vaults)
  const status = useMemberSyncStore((state) => state.status)
  const retry = useMemberSyncStore((state) => state.retry)
  const ui = useGlobalEntriesUi()
  const query = useDeferredValue(ui.query)
  const items = useMemo(() => globalEntries(vaults, query), [vaults, query])
  const totalEntries = useMemo(() => globalEntries(vaults, '').length, [vaults])
  const [createOpen, setCreateOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (!restored.current && scrollRef.current && items.length) {
      scrollRef.current.scrollTop = useGlobalEntriesUi.getState().scrollTop
      restored.current = true
    }
  }, [items.length])
  const update = (patch: Partial<typeof ui>) => {
    useGlobalEntriesUi.setState({ ...patch, scrollTop: 0, renderLimit: 100 })
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }
  const partial = status === 'error' || [...vaults.values()].some((vault) => vault.status === 'error')
  return <div className="flex h-full min-h-0 flex-col px-4 py-4 text-[var(--cv-t1)]">
    <EntryListHeader title={t('entries.title')} count={totalEntries} headingLevel="h1" onAdd={() => setCreateOpen(true)} />
    <SearchBar value={ui.query} onChange={(value) => update({ query: value })} placeholder={t('vault.detail.entriesSearchPlaceholder')} className="mb-3 shrink-0" />
    {partial && <div className="mb-3 shrink-0"><ErrorState message={t('vault.entries.partialSyncError')} onRetry={retry} /></div>}
    <ScrollArea scrollRef={scrollRef} onScroll={(event) => useGlobalEntriesUi.setState({ scrollTop: event.currentTarget.scrollTop })}>
      {(status === 'idle' || status === 'syncing') && !items.length ? <div className="space-y-2">{[0, 1, 2].map((key) => <SkeletonBlock key={key} className="h-16" />)}</div>
        : !items.length ? <EmptyState title={t('vault.entries.emptySearch')} />
        : <div className="flex flex-col gap-2">{items.slice(0, ui.renderLimit).map((entry) => <EntryNavigationRow
          key={`${entry.vaultId}:${entry.id}`} vaultId={entry.vaultId} entryId={entry.id}
          label={entry.label} type={entry.type} icon={entry.icon}
          subtitle={`${entry.vaultName} · ${entry.corrupt ? t('entries.unavailable') : t(`entries.type.${['key', 'credential', 'script', 'creditCard'][entry.type]}`)}`}
          isSelected={selectedEntryId === entry.id && selectedVaultId === entry.vaultId}
          fromEntries disabled={entry.corrupt}
        />)}<LoadMoreSentinel hasNextPage={ui.renderLimit < items.length} isFetchingNextPage={false} isFetchNextPageError={false} onLoadMore={() => useGlobalEntriesUi.setState({ renderLimit: ui.renderLimit + 100 })} /></div>}
    </ScrollArea>
    {createOpen && <GlobalCreateEntry onClose={() => setCreateOpen(false)} />}
  </div>
}
