import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { VaultAgentGrantCard } from './components/vault-agent-grant-card'
import {
  MOCK_AGENT_GRANTS,
  type MockAgentGrant,
} from './components/vault-agent-grants-mock'
import { VaultDetailHeader } from './components/vault-detail-header'
import {
  VaultDetailTabs,
  type VaultDetailTab,
} from './components/vault-detail-tabs'
import { VaultEntriesList } from './components/vault-entries-list'
import { MOCK_ENTRIES } from './components/vault-entries-mock'
import { VaultSearchBar } from './components/vault-search-bar'
import { RevokeGrantDialog } from './components/revoke-grant-dialog'
import { VaultSettingsForm } from './components/vault-settings-form'
import type { Vault } from './types'
import { useVault } from './use-vault'

const PAGE_BACKGROUND =
  'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)'

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
    <div className="min-h-screen text-[#FDF9E4]" style={{ background: PAGE_BACKGROUND }}>
      <div className="mx-auto max-w-6xl px-6 py-10">
        {vault.isPending ? (
          <div className="h-32 animate-pulse rounded-2xl bg-[rgba(13,27,62,0.6)]" />
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
    case 'settings':
      return (
        <Button variant="accent" size="sm" icon="check" form="vault-settings-form" type="submit">
          {t('vault.saveChanges')}
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
      return <AgentsTab vaultName={vault.name} />
    case 'audit-log':
      return <ComingSoonTab translationKey="vault.detail.auditLogComingSoon" />
    case 'members':
      return <ComingSoonTab translationKey="vault.detail.membersComingSoon" />
    case 'settings':
      return <VaultSettingsForm vault={vault} formId="vault-settings-form" />
    default:
      return null
  }
}

function EntriesTab() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const trimmed = search.trim().toLowerCase()
    if (trimmed.length === 0) return MOCK_ENTRIES
    return MOCK_ENTRIES.filter((entry) =>
      `${entry.name} ${entry.meta}`.toLowerCase().includes(trimmed),
    )
  }, [search])

  return (
    <>
      <VaultSearchBar
        value={search}
        onChange={setSearch}
        placeholder={t('vault.detail.entriesSearchPlaceholder')}
      />
      {filtered.length === 0 ? (
        <EmptyMessage message={t('vault.detail.entriesEmpty')} />
      ) : (
        <VaultEntriesList entries={filtered} />
      )}
    </>
  )
}

function AgentsTab({ vaultName }: { vaultName: string }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<MockAgentGrant | null>(null)

  const filtered = useMemo(() => {
    const trimmed = search.trim().toLowerCase()
    if (trimmed.length === 0) return MOCK_AGENT_GRANTS
    return MOCK_AGENT_GRANTS.filter((grant) =>
      grant.agent.name.toLowerCase().includes(trimmed),
    )
  }, [search])

  return (
    <>
      <VaultSearchBar
        value={search}
        onChange={setSearch}
        placeholder={t('vault.detail.agentsSearchPlaceholder')}
      />
      {filtered.length === 0 ? (
        <EmptyMessage message={t('vault.detail.agentsEmpty')} />
      ) : (
        <div
          className="grid gap-2.5"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          {filtered.map((grant) => (
            <VaultAgentGrantCard
              key={grant.id}
              grant={grant}
              onRevoke={(g) => setRevokeTarget(g)}
              onRegrant={(g) => console.info('regrant', g.id)}
              onRestore={(g) => console.info('restore', g.id)}
            />
          ))}
        </div>
      )}
      <RevokeGrantDialog
        grant={revokeTarget}
        vaultName={vaultName}
        onClose={() => setRevokeTarget(null)}
        onConfirm={(reason) => {
          console.info('revoke confirmed', revokeTarget?.id, reason)
          setRevokeTarget(null)
        }}
      />
    </>
  )
}

function ComingSoonTab({ translationKey }: { translationKey: string }) {
  const { t } = useTranslation()
  return <EmptyMessage message={t(translationKey)} />
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[rgba(253,249,228,0.12)]
      bg-[rgba(13,27,62,0.4)] p-8 text-center text-sm text-[#8A95A6]">
      {message}
    </div>
  )
}
