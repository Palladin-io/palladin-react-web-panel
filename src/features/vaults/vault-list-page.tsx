import { useMemo, useState } from 'react'
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
import { PERMISSION_MULTIPLE_VAULTS, type VaultSummary } from './types'
import { useVaults } from './use-vaults'

export function VaultListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vaults = useVaults()
  const permissions = useAuthStore((s) => s.permissions)
  const [createOpen, setCreateOpen] = useState(false)
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [search, setSearch] = useState('')
  const isWide = useWideScreen()

  const list = vaults.data?.vaults ?? []
  const filteredList = useFilteredVaults(list, search)
  const totalEntries = list.reduce((sum, v) => sum + (v.entryCount ?? 0), 0)
  const canCreateMore =
    list.length === 0 || (permissions & PERMISSION_MULTIPLE_VAULTS) !== 0

  const goToVault = (id: string) => {
    navigate({ to: '/vaults/$vaultId', params: { vaultId: id } })
  }

  // Single entry point for the "+ Create Vault" affordance. The button is
  // always visible — gating belongs in the handler so users see a clear
  // upsell instead of a missing button. Free users above the cap land in
  // the premium dialog; everyone else gets the regular create flow.
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
            {list.length === 0 ? (
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
          onCreated={(id) => goToVault(id)}
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
      <div className="px-6 py-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-page-title font-bold leading-tight text-[var(--cv-t1)]">
              {t('vault.title')}
            </h1>
            <p className="mt-1 text-meta text-[var(--cv-t3)]">
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
          isLoading={vaults.isPending}
          isError={vaults.isError}
          isEmpty={!vaults.isPending && !vaults.isError && list.length === 0}
          isEmptyAfterFilter={
            !vaults.isPending &&
            !vaults.isError &&
            list.length > 0 &&
            filteredList.length === 0
          }
          onCreate={handleCreateClick}
          onRetry={vaults.refetch}
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-6">
            {filteredList.map((vault) => (
              <VaultCard
                key={vault.id}
                vault={vault}
                onClick={() => goToVault(vault.id)}
              />
            ))}
          </div>
        </Body>
      </div>

      <CreateVaultDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => goToVault(id)}
      />
      <PremiumGateDialog
        open={premiumOpen}
        onClose={() => setPremiumOpen(false)}
      />
    </div>
  )
}

function useFilteredVaults(list: VaultSummary[], search: string) {
  return useMemo(() => {
    const trimmed = search.trim().toLowerCase()
    if (trimmed.length === 0) return list
    return list.filter((v) => {
      const haystack = `${v.name} ${v.description ?? ''}`.toLowerCase()
      return haystack.includes(trimmed)
    })
  }, [list, search])
}

interface BodyProps {
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  isEmptyAfterFilter: boolean
  onCreate: () => void
  onRetry: () => void
  children: React.ReactNode
}

/**
 * Branches between loading skeletons, the error banner, the empty-state
 * CTA, and the actual grid. Pulled out of the page so the page reads as
 * a single hierarchy and the four states stay visually balanced.
 */
function Body({
  isLoading,
  isError,
  isEmpty,
  isEmptyAfterFilter,
  onCreate,
  onRetry,
  children,
}: BodyProps) {
  const { t } = useTranslation()

  if (isLoading) {
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

  if (isError) {
    return <ErrorState message={t('vault.errorLoad')} onRetry={onRetry} />
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

  return <>{children}</>
}
