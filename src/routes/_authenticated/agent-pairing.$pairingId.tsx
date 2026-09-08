import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AgentPairingPage } from '../../features/agents'
import { useAuthStore } from '../../features/auth'
import { API_KEYS_QUERY_KEY } from '../../features/api-keys'
import { reconcileAgentDiscovery } from '../../features/vaults'
import {
  canPairAgent,
  PERMISSION_READ_API_KEY,
  PERMISSION_WRITE_API_KEY,
} from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/agent-pairing/$pairingId')({
  remountDeps: ({ params }) => params.pairingId,
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if (!canPairAgent(permissions)) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: AgentPairingRoute,
})

function AgentPairingRoute() {
  const { pairingId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const permissions = useAuthStore((state) => state.permissions)
  const canReadApiKeys = (permissions & PERMISSION_READ_API_KEY) !== 0
  const canWriteApiKeys = (permissions & PERMISSION_WRITE_API_KEY) !== 0
  const canPair = canPairAgent(permissions)
  useEffect(() => {
    if (!canPair) void navigate({ to: '/vaults', replace: true })
  }, [canPair, navigate])
  if (!canPair) return null
  return (
    <AgentPairingPage
      pairingId={pairingId}
      key={`${pairingId}:${canReadApiKeys}:${canWriteApiKeys}`}
      canReadApiKeys={canReadApiKeys}
      canWriteApiKeys={canWriteApiKeys}
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
        if (canReadApiKeys) await queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY })
        await navigate({ to: '/agents/$agentId', params: { agentId }, replace: true })
      }}
      onClose={() => { void navigate({ to: '/agents', replace: true }) }}
      onRejected={() => navigate({ to: '/agents', replace: true })}
    />
  )
}
