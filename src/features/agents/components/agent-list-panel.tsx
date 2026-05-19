import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_DEACTIVATED,
  AGENT_STATUS_PENDING,
  type Agent,
  type AgentStatus,
} from '../api/agents-api'
import { useAgents } from '../use-agents'
import { AgentAvatar } from './agent-avatar'
import {
  agentDisplayName,
  formatAgentDate,
} from './agent-presentation'

export interface AgentListPanelProps {
  /** Agent currently shown in the right detail panel (split-view). */
  selectedAgentId?: string
}

/** Compact status pill mirroring the detail panel badge. */
export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const { t } = useTranslation()

  const config: Record<AgentStatus, { label: string; className: string }> = {
    [AGENT_STATUS_ACTIVE]: {
      label: t('agents.statusActive'),
      className: 'bg-[rgba(46,196,182,0.14)] text-[#2EC4B6]',
    },
    [AGENT_STATUS_PENDING]: {
      label: t('agents.statusPending'),
      className: 'bg-[rgba(240,192,64,0.16)] text-[#D4820A]',
    },
    [AGENT_STATUS_DEACTIVATED]: {
      label: t('agents.statusDeactivated'),
      className: 'bg-[rgba(255,79,79,0.12)] text-[#FF4F4F]',
    },
  }
  const { label, className } = config[status]

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px]
        font-semibold ${className}`}
    >
      {label}
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
  const [search, setSearch] = useState('')

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
            <ul className="flex flex-col gap-2">
              {filtered.map((agent) => (
                <li key={agent.agentId}>
                  <AgentRow
                    agent={agent}
                    isSelected={agent.agentId === selectedAgentId}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

interface AgentRowProps {
  agent: Agent
  isSelected: boolean
}

function AgentRow({ agent, isSelected }: AgentRowProps) {
  const { t } = useTranslation()

  return (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.agentId }}
      className={`flex items-center gap-3 px-4 py-3 ${HOVERABLE_CARD_CLASSES}${
        isSelected ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''
      }`}
    >
      <AgentAvatar agent={agent} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">
            {agentDisplayName(agent, t('agents.unnamed'))}
          </span>
          <AgentStatusBadge status={agent.status} />
        </div>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--cv-t3)]">
          {rowSubtitle(agent, t)}
        </span>
      </div>
    </Link>
  )
}

function rowSubtitle(
  agent: Agent,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (agent.status === AGENT_STATUS_PENDING) {
    return t('agents.pendingApproval')
  }
  if (agent.status === AGENT_STATUS_DEACTIVATED && agent.deactivatedAt) {
    return `${t('agents.deactivatedOn')} ${formatAgentDate(agent.deactivatedAt)}`
  }
  if (agent.enrolledAt) {
    return `${t('agents.enrolled')} ${formatAgentDate(agent.enrolledAt)}`
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
