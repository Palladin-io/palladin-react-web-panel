import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { GrantAccessDialog, OrgGrantsPanel } from '../grants'
import { CreateEntryModal } from './components/create-entry-modal'
import { VaultDetailHeader } from './components/vault-detail-header'
import {
  VaultDetailTabs,
  type VaultDetailTab,
} from './components/vault-detail-tabs'
import { VaultEntriesTab } from './components/vault-entries-tab'
import { VaultListPanel } from './components/vault-list-panel'
import { VaultSettingsForm } from './components/vault-settings-form'
import type { Vault } from './types'
import { useVault } from './use-vault'

export interface VaultDetailPageProps {
  vaultId: string
  /** Tab to open initially (e.g. deep-linked `?tab=agents` from a notification). */
  initialTab?: VaultDetailTab
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
export function VaultDetailPage({ vaultId, initialTab }: VaultDetailPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)
  const [activeTab, setActiveTab] = useState<VaultDetailTab>(initialTab ?? 'entries')
  const [createEntryOpen, setCreateEntryOpen] = useState(false)
  const [addAgentOpen, setAddAgentOpen] = useState(false)
  const isWide = useWideScreen(1280)

  const vaultContent = vault.isPending ? (
    <div className="h-32 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
  ) : vault.isError || !vault.data ? (
    <ErrorState message={t('vault.errorLoad')} onRetry={vault.refetch} />
  ) : (
    <>
      <DetailBody
        vault={vault.data}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBack={() => navigate({ to: '/vaults' })}
        onAddEntry={() => setCreateEntryOpen(true)}
        onAddAgent={() => setAddAgentOpen(true)}
        showHeader={!isWide}
      />
      <CreateEntryModal
        open={createEntryOpen}
        vault={vault.data}
        onClose={() => setCreateEntryOpen(false)}
      />
      {addAgentOpen && (
        <GrantAccessDialog
          mode={{ kind: 'agent-for-vault', vaultId: vault.data.id }}
          onClose={() => setAddAgentOpen(false)}
        />
      )}
    </>
  )

  if (isWide) {
    return (
      <div className="flex h-full text-[var(--cv-t1)]">
        <div className="w-[clamp(300px,22vw,400px)] shrink-0 overflow-y-auto border-r border-[var(--cv-border)]">
          <div className="px-4 py-4">
            <VaultListPanel selectedVaultId={vaultId} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="px-4 py-4">{vaultContent}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[var(--cv-t1)]">
      <div className="px-6 py-8">{vaultContent}</div>
    </div>
  )
}

interface DetailBodyProps {
  vault: Vault
  activeTab: VaultDetailTab
  onTabChange: (next: VaultDetailTab) => void
  onBack?: () => void
  onAddEntry: () => void
  onAddAgent: () => void
  showHeader?: boolean
}

function DetailBody({
  vault,
  activeTab,
  onTabChange,
  onBack,
  onAddEntry,
  onAddAgent,
  showHeader = true,
}: DetailBodyProps) {
  const { t } = useTranslation()
  const subtitle = t('vault.subtitle.entryCount', { count: vault.entryCount })

  return (
    <>
      {showHeader ? (
        <VaultDetailHeader
          title={vault.name}
          subtitle={subtitle}
          onBack={onBack}
          actions={
            <TabActions
              activeTab={activeTab}
              onAddEntry={onAddEntry}
              onAddAgent={onAddAgent}
            />
          }
        />
      ) : null}
      <VaultDetailTabs
        active={activeTab}
        onChange={onTabChange}
        actions={
          showHeader ? undefined : (
            <TabActions
              activeTab={activeTab}
              onAddEntry={onAddEntry}
              onAddAgent={onAddAgent}
            />
          )
        }
      />
      <TabPanel activeTab={activeTab} vault={vault} />
    </>
  )
}

interface TabActionsProps {
  activeTab: VaultDetailTab
  onAddEntry: () => void
  onAddAgent: () => void
}

function TabActions({ activeTab, onAddEntry, onAddAgent }: TabActionsProps) {
  const { t } = useTranslation()

  switch (activeTab) {
    case 'entries':
      return (
        <>
          <Button variant="subtle" size="sm" icon="file_upload">
            {t('vault.detail.import')}
          </Button>
          <Button variant="accent" size="sm" icon="add" onClick={onAddEntry}>
            {t('vault.detail.addEntry')}
          </Button>
        </>
      )
    case 'agents':
      return (
        <Button variant="accent" size="sm" icon="add" onClick={onAddAgent}>
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
      return <VaultEntriesTab vault={vault} />
    case 'agents':
      return <AgentsTab vault={vault} />
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

function AgentsTab({ vault }: { vault: Vault }) {
  // Reuses the Approvals org-grants panel, scoped to this vault (FULL grants on
  // the vault + GRANULAR grants on its entries) — one component, many locations.
  return <OrgGrantsPanel vaultId={vault.id} />
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
