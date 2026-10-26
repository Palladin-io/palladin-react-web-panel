import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { NAVIGATION_ROW_CLASSES, SELECTED_NAVIGATION_CARD_CLASSES } from '../../../shared/lib/styles'
import { AGENT_STATUS_DEACTIVATED, type Agent } from '../api/agents-api'
import { AgentAvatar } from './agent-avatar'
import { AgentStatusBadge } from './agent-status-badge'
import {
  agentDisplayName,
  agentTypeLabelKey,
  formatPublicKey,
} from './agent-presentation'

export interface AgentCardProps {
  agent: Agent
  isSelected: boolean
}

export function AgentCard({ agent, isSelected }: AgentCardProps) {
  const { t } = useTranslation()
  const isDeactivated = agent.status === AGENT_STATUS_DEACTIVATED

  const subtitle = agent.type
    ? (agentTypeLabelKey(agent.type) ? t(agentTypeLabelKey(agent.type)!) : agent.type)
    : formatPublicKey(agent)

  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.agentId }}
      aria-current={isSelected ? 'page' : undefined}
      className={`flex items-center gap-3 px-3 py-3 ${NAVIGATION_ROW_CLASSES}${isSelected ? ` ${SELECTED_NAVIGATION_CARD_CLASSES}` : ''}${isDeactivated ? ' opacity-70' : ''}`}
    >
      <AgentAvatar agent={agent} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-ui font-medium text-[var(--cv-t1)]">
            {agentDisplayName(agent, t('agents.unnamed'))}
          </p>
          <AgentStatusBadge status={agent.status} />
        </div>
        <p className={`truncate text-[var(--cv-t3)] ${agent.type ? 'text-meta' : 'font-mono text-micro'}`}>
          {subtitle}
        </p>
      </div>
    </Link>
  )
}
