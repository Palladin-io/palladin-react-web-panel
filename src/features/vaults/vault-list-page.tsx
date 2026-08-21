import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { useAuthStore } from '../auth'
import { CreateVaultDialog } from './components/create-vault-dialog'
import { PremiumGateDialog } from './components/premium-gate-dialog'
import { VaultCard } from './components/vault-card'
import { VaultListPanel } from './components/vault-list-panel'
import { SearchBar } from '../../shared/components/search-bar'
import { PERMISSION_MULTIPLE_VAULTS } from './types'
import { useMemberVaultList, type MemberVaultListItem } from './sync/member-vault-list'

export function VaultListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const permissions = useAuthStore((s) => s.permissions)
  const [createOpen, setCreateOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [search, setSearch] = useState('')
  const isWide = useWideScreen()

  const vaults = useMemberVaultList(search)
  const list = vaults.allItems
  const filteredList = vaults.items
  const totalEntries = list.reduce((sum, vault) => sum + vault.entryCount, 0)
  const canCreateMore =
    list.length === 0 || (permissions & PERMISSION_MULTIPLE_VAULTS) !== 0

  const goToVault = (id: string) => {
    navigate({ to: '/vaults/$vaultId', params: { vaultId: id } })
  }

  const handleCreateClick = () => {
    if (canCreateMore) {
      setCreateOpen(true)
    } else {
      setPremiumOpen(true)
    }
  }

  if (isWide) {
    return (
      <div className="flex h-full text-[var(--cv-t1)]">
        <div className="w-[clamp(18.75rem,22vw,25rem)] shrink-0 overflow-hidden border-r border-[var(--cv-border)]">
          <div className="h-full px-4 pt-4">
            <VaultListPanel />
          </div>
        </div>
        <div className="subtle-scrollbar flex-1 overflow-y-auto min-w-0">
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Icon name="shield" size={48} color="var(--cv-t3)" />
            {vaults.status === 'ready' && list.length === 0 ? (
              <>
                <h2 className="text-lg font-semibold text-[var(--cv-t1)]">
                  {t('vault.noVaults')}
                </h2>
                <p className="max-w-sm text-ui text-[var(--cv-t3)]">
                  {t('vault.noVaultsSubtitle')}
                </p>
                <Button
                  variant="accent"
                  size="sm"
                  icon="add"
                  onClick={handleCreateClick}
                  className="mt-2"
                >
                  {t('vault.createVault')}
                </Button>
              </>
            ) : vaults.status === 'syncing' || vaults.status === 'idle' ? (
              <p className="max-w-sm text-ui text-[var(--cv-t3)]">{t('vault.list.syncing')}</p>
            ) : (
              <p className="max-w-sm text-ui text-[var(--cv-t3)]">
                {t('vault.selectVaultPrompt')}
              </p>
            )}
          </div>
        </div>

        <CreateVaultDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
        <PremiumGateDialog
          open={premiumOpen}
          onClose={() => setPremiumOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="p-4">
        <header className="mb-4 flex h-10 items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-heading font-bold text-[var(--cv-t1)]">
              {t('vault.title')}
            </h1>
            <p className="truncate text-meta text-[var(--cv-t3)]">
              {t('vault.list.subtitle', {
                vaultCount: list.length,
                entryCount: totalEntries,
                count: list.length,
              })}
            </p>
          </div>
          <div className="flex items-center">
            <Button
              variant="accent"
              size="sm"
              icon="add"
              onClick={handleCreateClick}
            >
              {t('vault.createVault')}
            </Button>
          </div>
        </header>

        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={t('vault.list.searchPlaceholder')}
        />

        <Body
          status={vaults.status}
          hasItems={list.length > 0}
          isEmpty={vaults.status === 'ready' && list.length === 0}
          isEmptyAfterFilter={
            vaults.status === 'ready' &&
            list.length > 0 &&
            filteredList.length === 0
          }
          onCreate={handleCreateClick}
          onRetry={vaults.retry}
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-6">
            {filteredList.map((vault) => (
              <VaultListCard key={vault.id} vault={vault} onClick={() => goToVault(vault.id)} />
            ))}
          </div>
        </Body>
      </div>

      <CreateVaultDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <PremiumGateDialog
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
      />
    </div>
  )
}

interface BodyProps {
  status: ReturnType<typeof useMemberVaultList>['status']
  hasItems: boolean
  isEmpty: boolean
  isEmptyAfterFilter: boolean
  onCreate: () => void
  onRetry: () => void
  children: React.ReactNode
}

function Body({
  status,
  hasItems,
  isEmpty,
  isEmptyAfterFilter,
  onCreate,
  onRetry,
  children,
}: BodyProps) {
  const { t } = useTranslation()

  if (status === 'syncing' && !hasItems) {
    return (
      <div className="flex flex-wrap gap-6">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="h-[6.875rem] min-w-[17.5rem] flex-1 animate-pulse rounded-2xl
              border border-[var(--cv-border)] bg-[var(--cv-card-bg)]"
          />
        ))}
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <p role="status" className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-6 text-center text-ui text-[var(--cv-t3)]">
        {t('vault.list.locked')}
      </p>
    )
  }

  if (status === 'error' && !hasItems) {
    return <ErrorState message={t('vault.list.syncError')} onRetry={onRetry} />
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-10 text-center">
        <h2 className="text-lg font-semibold text-[var(--cv-t1)]">
          {t('vault.noVaults')}
        </h2>
        <p className="max-w-sm text-ui text-[var(--cv-t3)]">
          {t('vault.noVaultsSubtitle')}
        </p>
        <Button
          variant="accent"
          size="sm"
          icon="add"
          onClick={onCreate}
          className="mt-2"
        >
          {t('vault.createVault')}
        </Button>
      </div>
    )
  }

  if (isEmptyAfterFilter) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center text-ui text-[var(--cv-t3)]">
        {t('vault.list.emptySearch')}
      </div>
    )
  }

  return (
    <>
      {status === 'error' ? (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--cv-primary)] bg-[var(--cv-card-bg)] p-3 text-ui text-[var(--cv-t1)]">
          <span>{t('vault.list.partialSyncError')}</span>
          <Button variant="ghost" size="sm" onClick={onRetry}>{t('vault.list.retry')}</Button>
        </div>
      ) : null}
      {children}
    </>
  )
}

function VaultListCard({ vault, onClick }: { vault: MemberVaultListItem; onClick: () => void }) {
  const { t } = useTranslation()
  if (vault.name === null) {
    const metadataCorrupt = vault.failureKind === 'metadata'
    return (
      <div role="alert" className="flex min-h-[6.875rem] min-w-[17.5rem] flex-1 items-center gap-3 rounded-2xl border border-[var(--cv-primary)] bg-[var(--cv-card-bg)] p-4">
        <Icon name="encrypted" size={28} color="var(--cv-primary)" />
        <div>
          <p className="text-heading-sm font-semibold text-[var(--cv-t1)]">
            {t(metadataCorrupt ? 'vault.list.corruptTitle' : 'vault.list.unavailableTitle')}
          </p>
          <p className="text-meta text-[var(--cv-t3)]">
            {t(metadataCorrupt ? 'vault.list.corruptDescription' : 'vault.list.unavailableDescription')}
          </p>
        </div>
      </div>
    )
  }
  return (
    <VaultCard
      vault={{ ...vault, name: vault.name }}
      onClick={onClick}
      statusLabel={vault.syncStatus === 'resetting' ? t('vault.list.resetting') : undefined}
    />
  )
}
