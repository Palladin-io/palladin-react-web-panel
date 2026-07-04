import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../shared/components/error-state'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { AgentDetail, AgentDetailEmpty } from './components/agent-detail'
import { AgentListPanel } from './components/agent-list-panel'
import { useAgent } from './use-agent'

export interface AgentsPageProps {
  /** Selected agent from the route param; undefined on the bare `/agents` route. */
  agentId?: string
}

/**
 * Standalone Agents screen — a master/detail split view at `/agents`.
 * The left panel lists every agent with search; the right panel shows
 * the selected agent's detail with status-specific lifecycle actions.
 *
 * On narrow screens the list and detail collapse to a single column:
 * `/agents` shows the list, `/agents/$agentId` shows the detail.
 */
export function AgentsPage({ agentId }: AgentsPageProps) {
  const isWide = useWideScreen(1280)

  const detailContent = <AgentDetailContent agentId={agentId} />

  if (isWide) {
    return (
      <div className="flex h-full text-[var(--cv-t1)]">
        <div className="w-[clamp(300px,22vw,400px)] shrink-0 overflow-hidden border-r border-[var(--cv-border)]">
          <div className="h-full px-4 pt-4">
            <AgentListPanel selectedAgentId={agentId} />
          </div>
        </div>
        <div className="subtle-scrollbar min-w-0 flex-1 overflow-y-auto">
          <div className="px-4 py-4">{detailContent}</div>
        </div>
      </div>
    )
  }

  // Narrow: a single column. `/agents` shows the list,
  // `/agents/$agentId` shows the selected agent's detail. Full-width (no
  // centering) so the screen behaves like Vaults — `mx-auto max-w-*` here made
  // Agents look centered on smaller resolutions while every other screen
  // stretched edge-to-edge.
  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="px-4 py-4">
        {agentId ? detailContent : <AgentListPanel selectedAgentId={agentId} />}
      </div>
    </div>
  )
}

function AgentDetailContent({ agentId }: { agentId?: string }) {
  const { t } = useTranslation()
  // Hook order must stay stable — always call useAgent, gate it with
  // `enabled` instead of conditionally calling it.
  const agent = useAgent(agentId ?? '')

  if (!agentId) {
    return <AgentDetailEmpty />
  }
  if (agent.isPending) {
    return <DetailSkeleton />
  }
  if (agent.isError) {
    return (
      <ErrorState message={t('agents.errorLoad')} onRetry={agent.refetch} />
    )
  }
  if (!agent.data) {
    return (
      <div
        className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
          bg-[var(--cv-empty-bg)] p-8 text-center text-sm text-[var(--cv-t3)]"
      >
        {t('agents.notFound')}
      </div>
    )
  }
  return <AgentDetail agent={agent.data} />
}

function DetailSkeleton() {
  return <div className="h-56 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
}
