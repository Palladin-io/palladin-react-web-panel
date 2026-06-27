import { useTranslation } from 'react-i18next'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_DEACTIVATED,
  AGENT_STATUS_PENDING,
  type AgentStatus,
} from '../api/agents-api'

/** Compact status pill mirroring the Astro VaultAgentGrant badge. */
export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const { t } = useTranslation()

  const config: Record<AgentStatus, { label: string; className: string }> = {
    [AGENT_STATUS_ACTIVE]: {
      label: t('agents.statusActive'),
      className: 'bg-[rgba(16,185,129,0.1)] text-[#10B981]',
    },
    [AGENT_STATUS_PENDING]: {
      label: t('agents.statusPending'),
      className: 'bg-[rgba(240,192,64,0.12)] text-[#D4820A]',
    },
    [AGENT_STATUS_DEACTIVATED]: {
      label: t('agents.statusDeactivated'),
      className: 'bg-[rgb(var(--cv-primary-rgb)/0.1)] text-[var(--cv-primary)]',
    },
  }
  const { label, className } = config[status]

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5
        text-[10px] font-bold ${className}`}
    >
      ● {label}
    </span>
  )
}
