import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../shared/components/empty-state'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { OrgGrantsPanel } from '../../grants'
import { DISCOVERY_STATUS_CURRENT, type AgentDiscoveryProvisioningItem } from '../api/agent-discovery-api'
import { useAgentDiscoveryProvisioning } from '../use-agent-discovery-provisioning'

export function VaultAgentsTab({ vaultId }: { vaultId: string }) {
  const { t } = useTranslation()
  const discovery = useAgentDiscoveryProvisioning(vaultId)

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="vault-discovery-heading">
        <div className="mb-3">
          <h2 id="vault-discovery-heading" className="text-heading font-bold text-[var(--cv-t1)]">
            {t('vault.agents.discoveryTitle')}
          </h2>
          <p className="mt-1 text-meta text-[var(--cv-t3)]">
            {t('vault.agents.discoveryDescription')}
          </p>
        </div>
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-[var(--cv-info)] bg-[var(--cv-card-bg)] p-3">
          <Icon name="info" size={18} color="var(--cv-info)" className="mt-0.5 shrink-0" />
          <p className="text-meta text-[var(--cv-t2)]">{t('vault.agents.discoveryBoundary')}</p>
        </div>
        {!discovery.canManageVault ? (
          <EmptyState icon="lock" title={t('vault.agents.noPermission')} />
        ) : discovery.isPending ? (
          <DiscoverySkeleton />
        ) : discovery.isError ? (
          <ErrorState message={t('vault.agents.discoveryError')} onRetry={discovery.refetch} />
        ) : discovery.data?.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
            {discovery.data.map((agent) => <DiscoveryAgentRow key={agent.agentId} agent={agent} />)}
          </ul>
        ) : (
          <EmptyState icon="smart_toy" title={t('vault.agents.noActiveAgents')} />
        )}
        <p className="mt-3 text-micro text-[var(--cv-t3)]">{t('vault.agents.deactivatedNote')}</p>
      </section>

      <section aria-labelledby="vault-grants-heading">
        <div className="mb-3">
          <h2 id="vault-grants-heading" className="text-heading font-bold text-[var(--cv-t1)]">
            {t('vault.agents.grantsTitle')}
          </h2>
          <p className="mt-1 text-meta text-[var(--cv-t3)]">{t('vault.agents.grantsDescription')}</p>
        </div>
        <OrgGrantsPanel vaultId={vaultId} allowRegrant={false} />
      </section>
    </div>
  )
}

function DiscoveryAgentRow({ agent }: { agent: AgentDiscoveryProvisioningItem }) {
  const { t } = useTranslation()
  const current = agent.status === DISCOVERY_STATUS_CURRENT
  return (
    <li className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cv-btn-subtle-bg)]">
          <Icon name="smart_toy" size={20} color="var(--cv-t2)" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">
              {agent.agentName ?? shortenKey(agent.agentId)}
            </p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold ${
              current
                ? 'bg-[rgb(var(--cv-success-rgb)/0.12)] text-[var(--cv-success)]'
                : 'bg-[rgb(var(--cv-pending-rgb)/0.16)] text-[var(--cv-pending)]'
            }`}>
              {t(current ? 'vault.agents.current' : 'vault.agents.pending')}
            </span>
          </div>
          <p className="mt-1 text-micro text-[var(--cv-t3)]">
            {t('vault.agents.agentId', { id: shortenKey(agent.agentId) })}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--cv-divider)] pt-3 text-meta">
        <div>
          <dt className="text-[var(--cv-t3)]">{t('vault.agents.recipientKeyVersion')}</dt>
          <dd className="font-medium text-[var(--cv-t1)]">{agent.recipientKeyVersion}</dd>
        </div>
        <div>
          <dt className="text-[var(--cv-t3)]">{t('vault.agents.manifestRevision')}</dt>
          <dd className="font-medium text-[var(--cv-t1)]">{agent.manifestRevision ?? '—'}</dd>
        </div>
      </dl>
    </li>
  )
}

function DiscoverySkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3">
      {[0, 1].map((item) => (
        <SkeletonBlock key={item} rounded="xl" className="h-32" />
      ))}
    </div>
  )
}
