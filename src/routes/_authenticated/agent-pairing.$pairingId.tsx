import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AgentPairingPage } from '../../features/agents'
import { useAuthStore } from '../../features/auth'
import { API_KEYS_QUERY_KEY } from '../../features/api-keys'
import { reconcileAgentDiscovery } from '../../features/vaults'
import {
  PERMISSION_AGENT_MANAGE,
  PERMISSION_READ_API_KEY,
} from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/agent-pairing/$pairingId')({
  remountDeps: ({ params }) => params.pairingId,
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    const required = PERMISSION_AGENT_MANAGE | PERMISSION_READ_API_KEY
    if ((permissions & required) !== required) throw redirect({ to: '/vaults' })
  },
  component: AgentPairingRoute,
})

function AgentPairingRoute() {
  const { pairingId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return (
    <AgentPairingPage
      pairingId={pairingId}
      prepareDiscovery={async (signal) => {
        const memberPrivateKey = useAuthStore.getState().privateKey
        if (!memberPrivateKey) return false
        try {
          await reconcileAgentDiscovery(memberPrivateKey, signal)
          return true
        } catch {
          // Activation is complete. The standard unlocked reconciler retries safely.
          return false
        }
      }}
      onApproved={async (agentId) => {
        await queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
        await navigate({ to: '/agents/$agentId', params: { agentId }, replace: true })
      }}
      onClose={() => { void navigate({ to: '/agents', replace: true }) }}
      onRejected={() => navigate({ to: '/agents', replace: true })}
    />
  )
}
