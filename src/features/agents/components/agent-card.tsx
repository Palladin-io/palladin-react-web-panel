import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { AGENT_STATUS_DEACTIVATED, type Agent } from '../api/agents-api'
import { AgentAvatar } from './agent-avatar'
import { AgentStatusBadge } from './agent-status-badge'
import {
  agentDisplayName,
  agentTypeLabelKey,
  formatAgentDate,
  formatPublicKey,
} from './agent-presentation'

export interface AgentCardProps {
  agent: Agent
  /** Highlights the row when it matches the agent shown in a split-view detail. */
  isSelected: boolean
}

/**
 * A single agent row: avatar + name + status badge + type/key subtitle and a
 * footer with the connected/enrolled/deactivated date. Links to
 * `/agents/$agentId`. Shared between the Agents list and the API-key
 * "Agents" tab so both surfaces render identically.
 */
export function AgentCard({ agent, isSelected }: AgentCardProps) {
  const { t } = useTranslation()
  const isDeactivated = agent.status === AGENT_STATUS_DEACTIVATED

  const subtitle = agent.type
    ? (agentTypeLabelKey(agent.type) ? t(agentTypeLabelKey(agent.type)!) : agent.type)
    : formatPublicKey(agent)

  return (
    <div
      className={`group overflow-hidden rounded-xl border bg-[var(--cv-card-bg)] transition-colors ${
        isSelected
          ? 'border-[var(--cv-t1)]'
          : 'border-[var(--cv-border)] hover:bg-[var(--cv-card-hover)]'
      } ${isDeactivated ? 'opacity-70' : ''}`}
    >
      {/* Identity zone */}
      <Link
        to="/agents/$agentId"
        params={{ agentId: agent.agentId }}
        className="flex items-center gap-[0.625rem] px-[0.875rem] py-3"
      >
        <AgentAvatar agent={agent} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-heading-sm font-semibold text-[var(--cv-t1)]">
              {agentDisplayName(agent, t('agents.unnamed'))}
            </p>
            <AgentStatusBadge status={agent.status} />
          </div>
          <p className={`mt-0.5 truncate text-[var(--cv-t3)] ${agent.type ? 'text-meta' : 'font-mono text-micro'}`}>
            {subtitle}
          </p>
        </div>
      </Link>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-[0.875rem] py-2
          border-t border-[var(--cv-divider)]
          bg-[var(--cv-card-footer)]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <Icon
            name={isDeactivated ? 'block' : 'schedule'}
            size={12}
            color={isDeactivated ? 'var(--cv-primary)' : 'var(--cv-t3)'}
            className="shrink-0"
          />
          <span className="truncate text-micro text-[var(--cv-t3)]">
            {cardFooterText(agent, t)}
          </span>
        </div>
      </div>
    </div>
  )
}

function cardFooterText(
  agent: Agent,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (agent.status === AGENT_STATUS_DEACTIVATED && agent.deactivatedAt) {
    const by = agent.deactivatedByName ? ` · ${agent.deactivatedByName}` : ''
    return `${t('agents.deactivatedOn')} ${formatAgentDate(agent.deactivatedAt)}${by}`
  }
  if (agent.enrolledAt) {
    const by = agent.enrolledByName ? ` · ${agent.enrolledByName}` : ''
    return `${t('agents.enrolled')} ${formatAgentDate(agent.enrolledAt)}${by}`
  }
  return `${t('agents.connectedOn')} ${formatAgentDate(agent.createdAt)}`
}
