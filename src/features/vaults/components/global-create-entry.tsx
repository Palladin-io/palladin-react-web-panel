import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalShell } from '../../../shared/components/modal-shell'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { Button } from '../../../shared/components/button'
import { SearchBar } from '../../../shared/components/search-bar'
import { EmptyState } from '../../../shared/components/empty-state'
import { ErrorState } from '../../../shared/components/error-state'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import { useMemberVaultList } from '../sync/member-vault-list'
import { useVault } from '../use-vault'
import { CreateEntryModal } from './create-entry-modal'
import { CreateVaultDialog } from './create-vault-dialog'

export function GlobalCreateEntry({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [vaultId, setVaultId] = useState('')
  const [creatingVault, setCreatingVault] = useState(false)
  const vaults = useMemberVaultList(query)
  const selected = useVault(vaultId)
  const choices = vaults.items.filter((vault) => vault.name !== null && vault.syncStatus === 'ready')
  const loading = vaults.status === 'idle' || vaults.status === 'syncing' || vaults.status === 'resetting'
  const partialError = vaults.status === 'error' || vaults.allItems.some((vault) => vault.syncStatus === 'error')
  if (selected.data && vaults.allItems.some((vault) => vault.id === vaultId && vault.syncStatus === 'ready')) return <CreateEntryModal open vault={selected.data} onClose={onClose} onCreated={onClose} />
  if (creatingVault) return <CreateVaultDialog open onClose={() => setCreatingVault(false)} onCreated={() => setCreatingVault(false)} />
  return <ModalShell title={t('entries.chooseVault')} ariaLabel={t('entries.chooseVault')} onClose={onClose} trapFocus
    footer={<DialogFooter><Button size="sm" variant="subtle" className="flex-1" onClick={onClose}>{t('vault.cancel')}</Button></DialogFooter>}>
    <SearchBar value={query} onChange={setQuery} placeholder={t('entries.searchVaults')} className="mb-3" />
    {partialError && <div className="mb-3"><ErrorState message={t('vault.entries.partialSyncError')} onRetry={vaults.retry} /></div>}
    <div className="flex flex-col gap-2">
      {choices.map((vault) => <button key={vault.id} type="button" onClick={() => setVaultId(vault.id)} className={`px-4 py-3 text-left text-ui ${HOVERABLE_CARD_CLASSES}`}>{vault.name}</button>)}
      {choices.length === 0 && loading ? <SkeletonBlock className="h-16" /> : choices.length === 0 && <EmptyState title={t('entries.noVaultMatches')} action={vaults.status === 'ready' && vaults.allItems.length === 0
        ? <Button size="sm" variant="accent" onClick={() => setCreatingVault(true)}>{t('vault.createVault')}</Button> : undefined} />}
    </div>
  </ModalShell>
}
