import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { VaultDetailHeader } from './components/vault-detail-header'
import {
  VaultDetailTabs,
  type VaultDetailTab,
} from './components/vault-detail-tabs'
import { VaultSettingsForm } from './components/vault-settings-form'
import type { Vault } from './types'
import { useVault } from './use-vault'

export interface VaultDetailPageProps {
  vaultId: string
}

/**
 * Vault detail page — the central screen of the web panel. Hosts the
 * vault header (back, title, slot for tab actions) plus a tab bar with
 * five tabs: Entries, Agents, Audit Log, Members, Settings.
 *
 * Tab state lives in the page (no router hop) — switching is a local
 * concern of the detail view. The Settings tab embeds the existing
 * settings form so settings are reachable without leaving the page;
 * the dedicated `/vaults/:id/settings` route stays as a deep link.
 */
export function VaultDetailPage({ vaultId }: VaultDetailPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)
  const [activeTab, setActiveTab] = useState<VaultDetailTab>('entries')

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
          <DetailBody
            vault={vault.data}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onBack={() => navigate({ to: '/vaults' })}
          />
        )}
      </div>
    </div>
  )
}

interface DetailBodyProps {
  vault: Vault
  activeTab: VaultDetailTab
  onTabChange: (next: VaultDetailTab) => void
  onBack: () => void
}

function DetailBody({ vault, activeTab, onTabChange, onBack }: DetailBodyProps) {
  const { t } = useTranslation()
  const subtitle = t('vault.subtitle.entryCount', { count: vault.entryCount })

  return (
    <>
      <VaultDetailHeader
        title={vault.name}
        subtitle={subtitle}
        onBack={onBack}
        actions={<TabActions activeTab={activeTab} />}
      />
      <VaultDetailTabs active={activeTab} onChange={onTabChange} />
      <TabPanel activeTab={activeTab} vault={vault} />
    </>
  )
}

function TabActions({ activeTab }: { activeTab: VaultDetailTab }) {
  const { t } = useTranslation()
  switch (activeTab) {
    case 'entries':
      return (
        <>
          <Button variant="subtle" size="sm" icon="file_upload">
            {t('vault.detail.import')}
          </Button>
          <Button variant="accent" size="sm" icon="add">
            {t('vault.detail.addEntry')}
          </Button>
        </>
      )
    case 'agents':
      return (
        <Button variant="accent" size="sm" icon="add">
          {t('vault.detail.addAgent')}
        </Button>
      )
    default:
      return null
  }
}

function TabPanel({
  activeTab,
  vault,
}: {
  activeTab: VaultDetailTab
  vault: Vault
}) {
  switch (activeTab) {
    case 'entries':
      return <EntriesTab />
    case 'agents':
      return <AgentsTab />
    case 'audit-log':
      return <ComingSoonTab translationKey="vault.detail.auditLogComingSoon" />
    case 'members':
      return <ComingSoonTab translationKey="vault.detail.membersComingSoon" />
    case 'settings':
      return <VaultSettingsForm vault={vault} />
    default:
      return null
  }
}

function EntriesTab() {
  const { t } = useTranslation()
  return <EmptyMessage message={t('vault.detail.entriesEmpty')} />
}

function AgentsTab() {
  const { t } = useTranslation()
  return <EmptyMessage message={t('vault.detail.agentsEmpty')} />
}

function ComingSoonTab({ translationKey }: { translationKey: string }) {
  const { t } = useTranslation()
  return <EmptyMessage message={t(translationKey)} />
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
      bg-[var(--cv-empty-bg)] p-8 text-center text-sm text-[var(--cv-t3)]">
      {message}
    </div>
  )
}
