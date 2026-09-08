import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../../../shared/components/error-state'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { Icon } from '../../../shared/components/icon'
import { SearchBar } from '../../../shared/components/search-bar'
import { Button } from '../../../shared/components/button'
import { AGENT_STATUS_ACTIVE } from '../api/agents-api'
import { useAgents } from '../use-agents'
import { AgentCard } from './agent-card'
import { AddAgentDialog } from './add-agent-dialog'

export { AgentStatusBadge } from './agent-status-badge'

export interface AgentListPanelProps {
  /** Agent currently shown in the right detail panel (split-view). */
  selectedAgentId?: string
  canStartPairing: boolean
  canCreateApiKey: boolean
}

/**
 * Left-side master panel of the Agents split view: a header with the
 * agent count, a search field, and the scrollable list of agents. Each
 * row links to `/agents/$agentId`; the currently viewed agent is
 * highlighted with the shared selected-row treatment.
 */
export function AgentListPanel({
  selectedAgentId,
  canStartPairing,
  canCreateApiKey,
}: AgentListPanelProps) {
  const { t } = useTranslation()
  const agents = useAgents()
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex h-10 shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">
            {t('agents.title')}
          </h2>
          <p className="text-meta text-[var(--cv-t3)]">
            {t('agents.summary', { total: list.length, active: activeCount })}
          </p>
        </div>
        {canStartPairing ? (
          <Button variant="accent" size="sm" icon="add" onClick={() => setAddOpen(true)}>
            {t('agents.add.button')}
          </Button>
        ) : null}
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
          <p className="text-ui font-medium text-[var(--cv-t3)]">
            {t('agents.empty')}
          </p>
          <p className="text-meta text-[var(--cv-t3)]">
            {t('agents.emptyHint')}
          </p>
        </div>
      ) : (
        <>
          <SearchBar
            name="search"
            value={search}
            onChange={setSearch}
            placeholder={t('agents.searchPlaceholder')}
            className="mb-3 shrink-0"
          />

          <ScrollArea>
            {filtered.length === 0 ? (
              <div
                className="rounded-2xl border border-dashed border-[var(--cv-empty-border)]
                  bg-[var(--cv-empty-bg)] p-8 text-center text-ui text-[var(--cv-t3)]"
              >
                {t('agents.empty')}
              </div>
            ) : (
              <ul className="flex flex-col gap-[0.625rem]">
                {filtered.map((agent) => (
                  <li key={agent.agentId}>
                    <AgentCard
                      agent={agent}
                      isSelected={agent.agentId === selectedAgentId}
                    />
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </>
      )}
      <AddAgentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        canCreateApiKey={canCreateApiKey}
      />
    </div>
  )
}

function PanelLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[3.875rem] animate-pulse rounded-2xl bg-[var(--cv-card-bg)]"
        />
      ))}
    </div>
  )
}
