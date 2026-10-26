import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { AddButton } from '../../../shared/components/add-button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { NAVIGATION_ROW_CLASSES, SELECTED_NAVIGATION_CARD_CLASSES } from '../../../shared/lib/styles'
import { useAuthStore } from '../../auth'
import { PERMISSION_MULTIPLE_VAULTS } from '../types'
import { CreateVaultDialog } from './create-vault-dialog'
import { PremiumGateDialog } from './premium-gate-dialog'
import { VaultIconCircle } from './vault-icon-circle'
import { DEFAULT_VAULT_COLOR, DEFAULT_VAULT_ICON } from './vault-presentation'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SearchBar } from '../../../shared/components/search-bar'
import { useMemberVaultList, type MemberVaultListItem } from '../sync/member-vault-list'

export interface VaultListPanelProps {
  selectedVaultId?: string
}

export function VaultListPanel({ selectedVaultId }: VaultListPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const permissions = useAuthStore((s) => s.permissions)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const vaults = useMemberVaultList(search)

  const list = vaults.allItems
  const filtered = vaults.items
  const totalEntries = list.reduce((sum, vault) => sum + vault.entryCount, 0)

  const canCreateMore = list.length === 0 || (permissions & PERMISSION_MULTIPLE_VAULTS) !== 0

  const handleCreateClick = () => {
    if (canCreateMore) setCreateOpen(true)
    else setPremiumOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="app-master-header mb-4 flex h-10 shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">
            {t('vault.title')}
          </h2>
          <p className="truncate text-meta text-[var(--cv-t3)]">
            {vaults.status === 'syncing' && list.length === 0
              ? ' '
              : t('vault.list.subtitle', {
                  vaultCount: list.length,
                  entryCount: totalEntries,
                  count: list.length,
                })}
          </p>
        </div>
        <AddButton onClick={handleCreateClick} label={t('vault.createVault')} />
      </div>

      {vaults.status === 'syncing' && list.length === 0 ? (
        <PanelLoadingSkeleton />
      ) : vaults.status === 'idle' ? (
        <p role="status" className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4 text-ui text-[var(--cv-t3)]">
          {t('vault.list.locked')}
        </p>
      ) : vaults.status === 'error' && list.length === 0 ? (
        <ErrorState message={t('vault.list.syncError')} onRetry={vaults.retry} />
      ) : (
        <>
          {vaults.status === 'error' ? (
            <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--cv-primary)] bg-[var(--cv-card-bg)] p-3 text-meta text-[var(--cv-t1)]">
              <span>{t('vault.list.partialSyncError')}</span>
              <Button variant="ghost" size="sm" onClick={vaults.retry}>{t('vault.list.retry')}</Button>
            </div>
          ) : null}
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={t('vault.list.searchPlaceholder')}
            className="mb-3 shrink-0"
          />
          <ScrollArea>
            <div className="flex flex-col gap-2">
              {filtered.map((vault) => (
                <VaultRow
                  key={vault.id}
                  vault={vault}
                  isSelected={vault.id === selectedVaultId}
                  onClick={() =>
                    navigate({ to: '/vaults/$vaultId', params: { vaultId: vault.id } })
                  }
                />
              ))}
              {filtered.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
                  bg-[var(--cv-empty-bg)] p-6 text-center text-ui text-[var(--cv-t3)]">
                  {t('vault.list.emptySearch')}
                </p>
              )}
            </div>
          </ScrollArea>
        </>
      )}

      <CreateVaultDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <PremiumGateDialog open={premiumOpen} onClose={() => setPremiumOpen(false)} />
    </div>
  )
}

interface VaultRowProps {
  vault: MemberVaultListItem
  isSelected: boolean
  onClick: () => void
}

function VaultRow({ vault, isSelected, onClick }: VaultRowProps) {
  const { t } = useTranslation()
  if (vault.name === null) {
    const metadataCorrupt = vault.failureKind === 'metadata'
    return (
      <div role="alert" className="flex items-center gap-3 rounded-2xl border border-[var(--cv-primary)] bg-[var(--cv-card-bg)] px-4 py-3">
        <Icon name="encrypted" size={20} color="var(--cv-primary)" />
        <div className="min-w-0">
          <p className="truncate text-ui font-medium text-[var(--cv-t1)]">
            {t(metadataCorrupt ? 'vault.list.corruptTitle' : 'vault.list.unavailableTitle')}
          </p>
          <p className="text-micro text-[var(--cv-t3)]">
            {t(metadataCorrupt ? 'vault.list.corruptDescription' : 'vault.list.unavailableDescription')}
          </p>
        </div>
      </div>
    )
  }
  const accent = vault.color ?? DEFAULT_VAULT_COLOR
  const icon = vault.icon ?? DEFAULT_VAULT_ICON

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full cursor-pointer items-center overflow-hidden text-left ${NAVIGATION_ROW_CLASSES}${
        isSelected
          ? ` ${SELECTED_NAVIGATION_CARD_CLASSES}`
          : ''
      }`}
    >
      <div className="flex w-full items-center gap-3 px-3 py-3">
        <VaultIconCircle vaultId={vault.id} icon={icon} color={accent} size={32} iconSize={16} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-medium text-[var(--cv-t1)]">{vault.name}</p>
          <p className="text-meta text-[var(--cv-t3)]">
            {vault.syncStatus === 'resetting'
              ? t('vault.list.resetting')
              : t('vault.entries', { count: vault.entryCount })}
          </p>
        </div>
      </div>
    </button>
  )
}

function PanelLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--cv-card-bg)]" />
      ))}
    </div>
  )
}
