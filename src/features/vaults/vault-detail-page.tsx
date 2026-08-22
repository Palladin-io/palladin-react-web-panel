import { lazy, Suspense, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { ScrollArea } from '../../shared/components/scroll-area'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { CreateEntryModal } from './components/create-entry-modal'
import { ExportDialog } from './components/export-dialog'
import { VaultDetailHeader } from './components/vault-detail-header'
import {
  VaultDetailTabs,
  type VaultDetailTab,
} from './components/vault-detail-tabs'
import { VaultDetailAuditLog } from './components/vault-detail-audit-log'
import { VaultEntriesTab } from './components/vault-entries-tab'
import { VaultListPanel } from './components/vault-list-panel'
import { VaultSettingsForm } from './components/vault-settings-form'
import { VaultAgentsTab } from './components/vault-agents-tab'
import { VaultMembersTab } from './components/vault-members-tab'
import { GrantAccessDialog } from '../grants'
import type { Vault } from './types'
import { useVault } from './use-vault'

// The import wizard pulls in the CSV/JSON/XML/ZIP parsers (papaparse + fflate,
// ~70KB gzip). Lazy-load it so those bytes stay out of the /vaults route bundle
// until the user actually opens Import.
const ImportWizardModal = lazy(() =>
  import('./components/import-wizard-modal').then((m) => ({
    default: m.ImportWizardModal,
  })),
)

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
  const [importVault, setImportVault] = useState<Vault | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [addAgentOpen, setAddAgentOpen] = useState(false)
  const isWide = useWideScreen()
  const openImport = () => {
    if (vault.data) setImportVault(vault.data)
  }

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
        onImport={openImport}
        onExport={() => setExportOpen(true)}
        onAddAgent={() => setAddAgentOpen(true)}
        showHeader={!isWide}
      />
      <CreateEntryModal
        open={createEntryOpen}
        vault={vault.data}
        onClose={() => setCreateEntryOpen(false)}
      />
      <ExportDialog
        open={exportOpen}
        vaults={[{ id: vault.data.id, name: vault.data.name }]}
        onClose={() => setExportOpen(false)}
      />
      {addAgentOpen ? (
        <GrantAccessDialog
          mode={{ kind: 'agent-for-vault', vaultId }}
          onClose={() => setAddAgentOpen(false)}
        />
      ) : null}
    </>
  )

  const importModal = importVault ? (
    <Suspense fallback={null}>
      <ImportWizardModal
        open
        vault={importVault}
        onClose={() => setImportVault(null)}
      />
    </Suspense>
  ) : null

  if (isWide) {
    return (
      <>
        <div className="flex h-full overflow-hidden text-[var(--cv-t1)]">
          <div className="w-[clamp(18.75rem,22vw,25rem)] shrink-0 overflow-hidden border-r border-[var(--cv-border)]">
            <div className="h-full px-4 pt-4">
              <VaultListPanel selectedVaultId={vaultId} />
            </div>
          </div>
          <div className="flex-1 overflow-hidden min-w-0">
            <div className="h-full px-4 pt-4">{vaultContent}</div>
          </div>
        </div>
        {importModal}
      </>
    )
  }

  return (
    <>
      <div className="min-h-screen text-[var(--cv-t1)]">
        <div className="px-6 py-8">{vaultContent}</div>
      </div>
      {importModal}
    </>
  )
}

interface DetailBodyProps {
  vault: Vault
  activeTab: VaultDetailTab
  onTabChange: (next: VaultDetailTab) => void
  onBack?: () => void
  onAddEntry: () => void
  onImport: () => void
  onExport: () => void
  onAddAgent: () => void
  showHeader?: boolean
}

function DetailBody({
  vault,
  activeTab,
  onTabChange,
  onBack,
  onAddEntry,
  onImport,
  onExport,
  onAddAgent,
  showHeader = true,
}: DetailBodyProps) {
  const { t } = useTranslation()
  const subtitle = t('vault.subtitle.entryCount', { count: vault.entryCount })

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showHeader ? (
        <VaultDetailHeader
          title={vault.name}
          subtitle={subtitle}
          onBack={onBack}
          actions={
            <TabActions
              activeTab={activeTab}
              onAddEntry={onAddEntry}
              onImport={onImport}
              onExport={onExport}
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
              onImport={onImport}
              onExport={onExport}
              onAddAgent={onAddAgent}
            />
          )
        }
      />
      {activeTab === 'entries' ? (
        // The entries tab pins its own search bar and scrolls only the list.
        <div className="min-h-0 flex-1">
          <TabPanel activeTab={activeTab} vault={vault} />
        </div>
      ) : (
        <ScrollArea>
          <TabPanel activeTab={activeTab} vault={vault} />
        </ScrollArea>
      )}
    </div>
  )
}

interface TabActionsProps {
  activeTab: VaultDetailTab
  onAddEntry: () => void
  onImport: () => void
  onExport: () => void
  onAddAgent: () => void
}

function TabActions({ activeTab, onAddEntry, onImport, onExport, onAddAgent }: TabActionsProps) {
  const { t } = useTranslation()

  switch (activeTab) {
    case 'entries':
      return (
        <>
          <Button variant="subtle" size="sm" icon="file_download" onClick={onExport}>
            {t('vault.detail.export')}
          </Button>
          <Button variant="subtle" size="sm" icon="file_upload" onClick={onImport}>
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
      return <VaultAgentsTab vaultId={vault.id} />
    case 'audit-log':
      return <VaultDetailAuditLog vaultId={vault.id} />
    case 'members':
      return <VaultMembersTab vaultId={vault.id} memberCount={vault.memberCount} />
    case 'settings':
      return <VaultSettingsForm vault={vault} />
    default:
      return null
  }
}
