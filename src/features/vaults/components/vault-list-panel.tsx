import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import { useAuthStore } from '../../auth'
import { PERMISSION_MULTIPLE_VAULTS, type VaultSummary } from '../types'
import { useVaults } from '../use-vaults'
import { CreateVaultDialog } from './create-vault-dialog'
import { PremiumGateDialog } from './premium-gate-dialog'
import { vaultFooterLabel } from './vault-card'
import { VaultIconCircle } from './vault-icon-circle'
import { DEFAULT_VAULT_COLOR, DEFAULT_VAULT_ICON } from './vault-presentation'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { SearchBar } from '../../../shared/components/search-bar'

export interface VaultListPanelProps {
  selectedVaultId?: string
}

/**
 * Compact left-side panel of the vault detail split view. Renders the
 * vault list with search, highlighting the currently viewed vault.
 * Clicking a row navigates to that vault's detail page (right panel).
 */
export function VaultListPanel({ selectedVaultId }: VaultListPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vaults = useVaults()
  const permissions = useAuthStore((s) => s.permissions)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)

  const list = vaults.data?.vaults ?? []
  const totalEntries = list.reduce((sum, v) => sum + (v.entryCount ?? 0), 0)
  const filtered = search.trim()
    ? list.filter((v) =>
        `${v.name} ${v.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : list

  const canCreateMore = list.length === 0 || (permissions & PERMISSION_MULTIPLE_VAULTS) !== 0

  const handleCreateClick = () => {
    if (canCreateMore) setCreateOpen(true)
    else setPremiumOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex h-10 shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
            {t('vault.title')}
          </h2>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {vaults.isPending
              ? ' '
              : t('vault.list.subtitle', {
                  vaultCount: list.length,
                  entryCount: totalEntries,
                  count: list.length,
                })}
          </p>
        </div>
        <Button variant="accent" size="sm" icon="add" onClick={handleCreateClick}>
          {t('vault.createVault')}
        </Button>
      </div>

      {vaults.isPending ? (
        <PanelLoadingSkeleton />
      ) : vaults.isError ? (
        <ErrorState message={t('vault.errorLoad')} onRetry={vaults.refetch} />
      ) : (
        <>
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
                  bg-[var(--cv-empty-bg)] p-6 text-center text-sm text-[var(--cv-t3)]">
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
        onCreated={(id) => navigate({ to: '/vaults/$vaultId', params: { vaultId: id } })}
      />
      <PremiumGateDialog open={premiumOpen} onClose={() => setPremiumOpen(false)} />
    </div>
  )
}

interface VaultRowProps {
  vault: VaultSummary
  isSelected: boolean
  onClick: () => void
}

function VaultRow({ vault, isSelected, onClick }: VaultRowProps) {
  const { t, i18n } = useTranslation()
  const accent = vault.color ?? DEFAULT_VAULT_COLOR
  const icon = vault.icon ?? DEFAULT_VAULT_ICON
  const footerLabel = vaultFooterLabel(vault, i18n.language, t)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer flex-col overflow-hidden text-left ${HOVERABLE_CARD_CLASSES}${
        isSelected
          ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]'
          : ''
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <VaultIconCircle icon={icon} color={accent} size={32} iconSize={16} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">{vault.name}</p>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('vault.entries', { count: vault.entryCount ?? 0 })}
          </p>
        </div>
      </div>
      {footerLabel ? (
        <div className="flex items-center gap-1.5 border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-4 py-2">
          <Icon name="schedule" size={12} color="var(--cv-t3)" className="shrink-0" />
          <span className="truncate text-[10px] text-[var(--cv-t3)]">{footerLabel}</span>
        </div>
      ) : null}
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
