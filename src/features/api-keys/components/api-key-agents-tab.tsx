import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadMoreSentinel } from '../../../shared/components/load-more-sentinel'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { AgentCard } from '../../agents'
import { useApiKeyAgents } from '../use-api-key-agents'

export interface ApiKeyAgentsTabProps {
  apiKeyId: string
}

/**
 * "Agents" tab of the API-key detail view: a cursor-paginated list of the
 * agents whose most recent operation authenticated with this key. Rows reuse
 * the shared `AgentCard` and link to the agent detail.
 */
export function ApiKeyAgentsTab({ apiKeyId }: ApiKeyAgentsTabProps) {
  const { t } = useTranslation()
  const query = useApiKeyAgents(apiKeyId)

  const agents = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  )

  if (query.isPending) {
    return <ListLoadingSkeleton />
  }

  if (query.isError) {
    return (
      <ErrorState
        message={t('apiKeys.detail.agentsError')}
        onRetry={query.refetch}
      />
    )
  }

  if (agents.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-2xl border border-dashed
          border-[var(--cv-empty-border)] bg-[var(--cv-empty-bg)] p-8 text-center"
      >
        <Icon name="smart_toy" size={28} color="var(--cv-t3)" />
        <p className="text-[12px] font-medium text-[var(--cv-t3)]">
          {t('apiKeys.detail.agentsEmpty')}
        </p>
        <p className="text-[11px] text-[var(--cv-t3)]">
          {t('apiKeys.detail.agentsEmptyHint')}
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-[10px]">
        {agents.map((agent) => (
          <li key={agent.agentId}>
            <AgentCard agent={agent} isSelected={false} />
          </li>
        ))}
      </ul>

      <LoadMoreSentinel
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        isError={query.isFetchNextPageError}
        onLoadMore={() => query.fetchNextPage()}
      />
    </>
  )
}

function ListLoadingSkeleton() {
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
