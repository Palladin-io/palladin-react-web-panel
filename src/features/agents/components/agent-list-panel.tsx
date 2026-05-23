import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_DEACTIVATED,
  AGENT_STATUS_PENDING,
  type Agent,
  type AgentStatus,
} from '../api/agents-api'
import { useAgents } from '../use-agents'
import { useApproveAgent } from '../use-approve-agent'
import { AgentAvatar } from './agent-avatar'
import {
  agentDisplayName,
  agentTypeLabelKey,
  formatAgentDate,
  formatPublicKey,
} from './agent-presentation'
import { ApproveAgentDialog } from './approve-agent-dialog'

export interface AgentListPanelProps {
  /** Agent currently shown in the right detail panel (split-view). */
  selectedAgentId?: string
}

/** Compact status pill mirroring the Astro VaultAgentGrant badge. */
export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const { t } = useTranslation()

  const config: Record<AgentStatus, { label: string; className: string }> = {
    [AGENT_STATUS_ACTIVE]: {
      label: t('agents.statusActive'),
      className: 'bg-[rgba(46,196,182,0.1)] text-[#2EC4B6]',
    },
    [AGENT_STATUS_PENDING]: {
      label: t('agents.statusPending'),
      className: 'bg-[rgba(240,192,64,0.12)] text-[#D4820A]',
    },
    [AGENT_STATUS_DEACTIVATED]: {
      label: t('agents.statusDeactivated'),
      className: 'bg-[rgba(255,79,79,0.1)] text-[#FF4F4F]',
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

/**
 * Left-side master panel of the Agents split view: a header with the
 * agent count, a search field, and the scrollable list of agents. Each
 * row links to `/agents/$agentId`; the currently viewed agent is
 * highlighted with the shared selected-row treatment.
 */
export function AgentListPanel({ selectedAgentId }: AgentListPanelProps) {
  const { t } = useTranslation()
  const agents = useAgents()
  const approve = useApproveAgent()
  const [search, setSearch] = useState('')
  const [approveTarget, setApproveTarget] = useState<Agent | null>(null)

  const list = useMemo(() => agents.data ?? [], [agents.data])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query.length === 0) return list
    return list.filter((agent) => {
      const name = agent.name?.toLowerCase() ?? ''
      return (
        name.includes(query) ||
        agent.publicKeySuffix.toLowerCase().includes(query)
      )
    })
  }, [list, search])

  const activeCount = list.filter(
    (a) => a.status === AGENT_STATUS_ACTIVE,
  ).length

  return (
    <>
      <div className="mb-4 flex h-10 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-[var(--cv-t1)]">
            {t('agents.title')}
          </h2>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('agents.summary', { total: list.length, active: activeCount })}
          </p>
        </div>
      </div>

      {agents.isPending ? (
        <PanelLoadingSkeleton />
      ) : agents.isError ? (
        <ErrorState message={t('agents.errorLoad')} onRetry={agents.refetch} />
      ) : list.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
            border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
        >
          <Icon name="smart_toy" size={28} color="var(--cv-t3)" />
          <p className="text-[12px] font-medium text-[var(--cv-t3)]">
            {t('agents.empty')}
          </p>
          <p className="text-[11px] text-[var(--cv-t3)]">
            {t('agents.emptyHint')}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <div
              className="flex items-center gap-2 rounded-lg border border-[var(--cv-input-border)]
                bg-[var(--cv-input-bg)] px-3 py-2 transition-colors focus-within:border-[var(--cv-t1)]"
            >
              <Icon
                name="search"
                size={16}
                className="shrink-0 text-[var(--cv-input-placeholder)]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('agents.searchPlaceholder')}
                className="flex-1 border-none bg-transparent text-[12px] text-[var(--cv-input-text)]
                  placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
                bg-[var(--cv-empty-bg)] p-8 text-center text-[12px] text-[var(--cv-t3)]"
            >
              {t('agents.empty')}
            </div>
          ) : (
            <ul className="flex flex-col gap-[10px]">
              {filtered.map((agent) => (
                <li key={agent.agentId}>
                  <AgentCard
                    agent={agent}
                    isSelected={agent.agentId === selectedAgentId}
                    onApprove={() => setApproveTarget(agent)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {approveTarget ? (
        <ApproveAgentDialog
          open
          agentName={agentDisplayName(approveTarget, t('agents.unnamed'))}
          initialName={approveTarget.name ?? ''}
          isPending={approve.isPending}
          onConfirm={(input) => {
            approve.mutate(
              { agentId: approveTarget.agentId, input },
              {
                onSuccess: () => setApproveTarget(null),
                onError: () => {
                  toast.error(t('agents.errorApprove'))
                  setApproveTarget(null)
                },
              },
            )
          }}
          onCancel={() => setApproveTarget(null)}
        />
      ) : null}
    </>
  )
}

interface AgentRowProps {
  agent: Agent
  isSelected: boolean
  onApprove: () => void
}

function AgentCard({ agent, isSelected, onApprove }: AgentRowProps) {
  const { t } = useTranslation()
  const isPending = agent.status === AGENT_STATUS_PENDING
  const isDeactivated = agent.status === AGENT_STATUS_DEACTIVATED

  const subtitle = agent.type
    ? (agentTypeLabelKey(agent.type) ? t(agentTypeLabelKey(agent.type)!) : agent.type)
    : formatPublicKey(agent)

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-[var(--cv-card-bg)]
        transition-[border-color,box-shadow] dark:shadow-[0_1px_4px_rgba(0,0,0,0.2)] ${
        isSelected
          ? 'border-[var(--cv-t1)]'
          : 'border-[var(--cv-border)] hover:border-[rgba(138,149,166,0.35)] dark:hover:border-[var(--cv-t1)]'
      } ${isDeactivated ? 'opacity-70' : ''}`}
    >
      {/* Identity zone */}
      <Link
        to="/agents/$agentId"
        params={{ agentId: agent.agentId }}
        className="flex items-center gap-[10px] px-[14px] py-3 hover:bg-[var(--cv-bg-subtle)]"
      >
        <AgentAvatar agent={agent} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--cv-t1)]">
              {agentDisplayName(agent, t('agents.unnamed'))}
            </p>
            <AgentStatusBadge status={agent.status} />
          </div>
          <p className={`mt-0.5 truncate text-[var(--cv-t3)] ${agent.type ? 'text-[11px]' : 'font-mono text-[10px]'}`}>
            {subtitle}
          </p>
        </div>
      </Link>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-[14px] py-2
          border-t border-[var(--cv-divider)]
          bg-[rgba(0,11,46,0.015)] dark:bg-[rgba(253,249,228,0.02)]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <Icon
            name={isDeactivated ? 'block' : 'schedule'}
            size={12}
            color={isDeactivated ? '#FF4F4F' : 'var(--cv-t3)'}
            className="shrink-0"
          />
          <span className="truncate text-[10px] text-[var(--cv-t3)]">
            {cardFooterText(agent, t)}
          </span>
        </div>
        {isPending && (
          <button
            type="button"
            onClick={onApprove}
            className="ml-2 flex shrink-0 cursor-pointer items-center gap-1 rounded-[7px]
              border border-[rgba(46,196,182,0.3)] bg-[rgba(46,196,182,0.06)]
              px-2.5 py-1 text-[11px] font-semibold text-[#2EC4B6]
              transition-colors hover:bg-[rgba(46,196,182,0.12)]"
          >
            <Icon name="check_circle" size={12} />
            {t('agents.approve')}
          </button>
        )}
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

function PanelLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[62px] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
