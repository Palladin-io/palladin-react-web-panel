import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { VaultDetailHeader } from './components/vault-detail-header'
import {
  VaultDetailTabs,
  type VaultDetailTab,
} from './components/vault-detail-tabs'
import { VaultSettingsForm } from './components/vault-settings-form'
import { useVault } from './use-vault'

export interface VaultSettingsPageProps {
  vaultId: string
}

/**
 * Standalone settings page kept for deep linking (`/vaults/:id/settings`).
 * Visually mirrors the detail page — same header + tab bar — and embeds
 * the shared {@link VaultSettingsForm}. Switching tabs from here pops
 * back into the regular detail page so the user keeps a consistent
 * navigation model. Inherits the theme-aware gradient + text colour
 * from `_authenticated.tsx` (mirroring `vault-detail-page.tsx`).
 */
export function VaultSettingsPage({ vaultId }: VaultSettingsPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)

  const goToDetail = () => {
    navigate({ to: '/vaults/$vaultId', params: { vaultId } })
  }

  const handleTabChange = (tab: VaultDetailTab) => {
    if (tab === 'settings') return
    // Other tabs live on the detail route — pop back so the user lands
    // on the right tab without us duplicating the entire detail page.
    goToDetail()
  }

  return (
    <div className="min-h-screen text-[var(--cv-t1)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {vault.isPending ? (
          <div className="h-32 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
        ) : vault.isError || !vault.data ? (
          <div className="rounded-2xl border border-[rgba(255,79,79,0.3)] bg-[rgba(255,79,79,0.06)] p-6 text-sm text-[#FF4F4F]">
            {t('vault.errorLoad')}
          </div>
        ) : (
          <>
            <VaultDetailHeader
              title={vault.data.name}
              subtitle={t('vault.subtitle.entryCount', {
                count: vault.data.entryCount,
              })}
              onBack={goToDetail}
            />
            <VaultDetailTabs active="settings" onChange={handleTabChange} />
            {/* Re-key on the vault id so navigating between two vaults
                wipes all local form state — the new mount seeds from
                fresh props. */}
            <VaultSettingsForm
              key={vault.data.id}
              vault={vault.data}
              onSaved={goToDetail}
            />
          </>
        )}
      </div>
    </div>
  )
}
