import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { approveAgent, type ApproveAgentInput } from './api/agents-api'
import { agentQueryKey } from './use-agent'
import { AGENTS_QUERY_KEY } from './use-agents'
import { useAuthStore } from '../auth'
import { reconcileAgentDiscovery } from '../vaults/sync/agent-discovery-reconciler'

export type AgentApprovalPhase = 'idle' | 'approving' | 'provisioning'

export interface AgentApprovalResult {
  discoveryReady: boolean
}

export class AgentApprovalRequiresUnlockError extends Error {
  constructor() {
    super('Vault must be unlocked before approving an Agent')
    this.name = 'AgentApprovalRequiresUnlockError'
  }
}

export function useApproveAgent() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<AgentApprovalPhase>('idle')

  const mutation = useMutation({
    mutationFn: async ({
      agentId,
      input,
    }: {
      agentId: string
      input?: ApproveAgentInput
    }): Promise<AgentApprovalResult> => {
      const memberPrivateKey = useAuthStore.getState().privateKey
      if (!memberPrivateKey) throw new AgentApprovalRequiresUnlockError()

      setPhase('approving')
      await approveAgent(agentId, input)
      setPhase('provisioning')
      try {
        await reconcileAgentDiscovery(memberPrivateKey, new AbortController().signal)
        return { discoveryReady: true }
      } catch {
        // Agent activation is already committed and cannot be rolled back by
        // the client. The unlocked background reconciler will retry pending
        // Vaults; callers must surface that Discovery is not ready yet.
        return { discoveryReady: false }
      }
    },
    onSuccess: (_data, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) })
    },
    onSettled: () => setPhase('idle'),
  })

  return { ...mutation, phase }
}
