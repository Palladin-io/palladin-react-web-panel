import { createFileRoute, redirect } from '@tanstack/react-router'
import { AgentsPage } from '../../features/agents'
import { AgentLogsTab } from '../../features/audit'
import { useAuthStore } from '../../features/auth'
import { PERMISSION_AGENT_MANAGE } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/agents_/$agentId')({
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if ((permissions & PERMISSION_AGENT_MANAGE) === 0) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: AgentDetailRoute,
})

function AgentDetailRoute() {
  const { agentId } = Route.useParams()
  return (
    <AgentsPage
      agentId={agentId}
      renderLogs={(selectedAgentId) => (
        <AgentLogsTab key={selectedAgentId} agentId={selectedAgentId} />
      )}
    />
  )
}
