import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { type Agent, useDeactivateAgent } from '../../agents'
import { formatRelativeTime } from '../../grants'

export interface UnknownAgentCardProps {
  agent: Agent
}

/**
 * Warning card for an unregistered (pending) agent surfaced on the dashboard.
 * Registering & approving happens on the agent detail screen — where the user
 * can review the fingerprint and assign permissions — while "Reject" denies the
 * enrollment in place by deactivating the pending agent.
 */
export function UnknownAgentCard({ agent }: UnknownAgentCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deactivate = useDeactivateAgent()

  const name = agent.name?.trim() || t('dashboard.unknownAgent.fallbackName')
  const fingerprint = shortenKey(agent.publicKey ?? agent.agentId)

  function handleReview() {
    void navigate({ to: '/agents/$agentId', params: { agentId: agent.agentId } })
  }

  function handleReject() {
    deactivate.mutate(agent.agentId, {
      onSuccess: () =>
        toast.success(t('dashboard.unknownAgent.rejected', { name })),
      onError: () => toast.error(t('dashboard.unknownAgent.rejectError')),
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.2)]">
      <div className="flex items-center gap-1.5 border-b border-[rgb(var(--cv-primary-rgb)/0.13)] bg-[rgb(var(--cv-primary-rgb)/0.09)] px-[0.875rem] py-2.5">
        <Icon name="warning" size={14} color="var(--cv-primary)" />
        <span className="text-meta font-semibold text-[var(--cv-primary)]">
          {t('dashboard.unknownAgent.banner')}
        </span>
      </div>

      <div className="flex items-start gap-2.5 px-[0.875rem] py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.625rem] border-2 border-dashed border-[rgb(var(--cv-primary-rgb)/0.4)]">
          <Icon name="smart_toy" size={16} color="var(--cv-primary)" />
        </span>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-ui font-semibold text-[var(--cv-t1)]">{name}</span>
          <span className="text-meta text-[var(--cv-t3)]">
            {t('dashboard.unknownAgent.requesting')}
          </span>
          <span className="font-mono text-meta text-[var(--cv-t3)]">
            {t('dashboard.unknownAgent.fingerprint', { value: fingerprint })}
          </span>
        </div>
        <span className="shrink-0 whitespace-nowrap text-meta text-[var(--cv-t3)]">
          {formatRelativeTime(agent.createdAt, t)}
        </span>
      </div>

      <div className="flex gap-2 border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-[0.875rem] py-2">
        <Button
          variant="positive"
          size="sm"
          icon="verified_user"
          onClick={handleReview}
          className="flex-1"
        >
          {t('dashboard.unknownAgent.registerApprove')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={handleReject}
          disabled={deactivate.isPending}
        >
          {t('dashboard.unknownAgent.reject')}
        </Button>
      </div>
    </div>
  )
}
