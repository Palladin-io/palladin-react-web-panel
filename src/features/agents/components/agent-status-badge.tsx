import { MetadataBadge } from '../../../shared/components/metadata-badge'
import { useTranslation } from 'react-i18next'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_DEACTIVATED,
  AGENT_STATUS_DEACTIVATING,
  AGENT_STATUS_PENDING,
  type AgentStatus,
} from '../api/agents-api'

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const { t } = useTranslation()

  const config: Record<AgentStatus, { label: string; color: string }> = {
    [AGENT_STATUS_ACTIVE]: {
      label: t('agents.statusActive'),
      color: 'var(--cv-success)',
    },
    [AGENT_STATUS_PENDING]: {
      label: t('agents.statusPending'),
      color: 'var(--cv-pending)',
    },
    [AGENT_STATUS_DEACTIVATED]: {
      label: t('agents.statusDeactivated'),
      color: 'var(--cv-primary)',
    },
    [AGENT_STATUS_DEACTIVATING]: {
      label: t('agents.statusDeactivating'),
      color: 'var(--cv-pending)',
    },
  }
  const { label, color } = config[status]
  return <MetadataBadge color={color}>{label}</MetadataBadge>
}
