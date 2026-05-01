import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../auth'
import { CreateVaultDialog } from './components/create-vault-dialog'
import { VaultCard } from './components/vault-card'
import { PERMISSION_MULTIPLE_VAULTS } from './types'
import { useVaults } from './use-vaults'

const PAGE_BACKGROUND =
  'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)'

export function VaultListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vaults = useVaults()
  const permissions = useAuthStore((s) => s.permissions)
  const [dialogOpen, setDialogOpen] = useState(false)

  const list = vaults.data?.vaults ?? []
  const canCreateMore =
    list.length === 0 || (permissions & PERMISSION_MULTIPLE_VAULTS) !== 0

  const goToVault = (id: string) => {
    navigate({ to: '/vaults/$vaultId', params: { vaultId: id } })
  }

  return (
    <div className="min-h-screen text-[#FDF9E4]" style={{ background: PAGE_BACKGROUND }}>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{t('vault.title')}</h1>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            disabled={!canCreateMore}
            title={canCreateMore ? undefined : t('vault.upgradeForMoreVaults')}
            className="rounded-lg bg-[#2EC4B6] px-4 py-2 text-sm font-semibold text-[#000B2E]
              transition-colors hover:bg-[#26a89d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('vault.newVault')}
          </button>
        </header>

        <Body
          isLoading={vaults.isPending}
          isError={vaults.isError}
          isEmpty={!vaults.isPending && !vaults.isError && list.length === 0}
          onCreate={() => setDialogOpen(true)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((vault) => (
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
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(id) => goToVault(id)}
      />
    </div>
  )
}

interface BodyProps {
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  onCreate: () => void
  children: React.ReactNode
}

/**
 * Branches between loading skeletons, the error banner, the empty-state
 * CTA, and the actual grid. Pulled out of the page so the page reads as
 * a single hierarchy and the four states stay visually balanced.
 */
function Body({ isLoading, isError, isEmpty, onCreate, children }: BodyProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="h-[120px] animate-pulse rounded-2xl border border-[rgba(253,249,228,0.04)]
              bg-[#1A2A4A]"
          />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-[rgba(255,79,79,0.3)] bg-[rgba(255,79,79,0.06)] p-6 text-sm text-[#FF4F4F]">
        {t('vault.errorLoad')}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[rgba(253,249,228,0.12)] bg-[rgba(26,42,74,0.4)] p-10 text-center">
        <h2 className="text-lg font-semibold text-[#FDF9E4]">
          {t('vault.noVaults')}
        </h2>
        <p className="max-w-sm text-sm text-[#6B7A8E]">
          {t('vault.noVaultsSubtitle')}
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-2 rounded-lg bg-[#2EC4B6] px-4 py-2 text-sm font-semibold text-[#000B2E]
            transition-colors hover:bg-[#26a89d]"
        >
          {t('vault.createVault')}
        </button>
      </div>
    )
  }

  return <>{children}</>
}
