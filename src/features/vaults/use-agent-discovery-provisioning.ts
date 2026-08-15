import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { PERMISSION_VAULT_MANAGE } from '../../shared/lib/permissions'
import {
  DISCOVERY_STATUS_PENDING,
  getAgentDiscoveryProvisioning,
} from './api/agent-discovery-api'

const PENDING_DISCOVERY_REFETCH_INTERVAL_MS = 15_000

export function agentDiscoveryProvisioningQueryKey(vaultId: string) {
  return ['vaults', vaultId, 'discovery', 'agents'] as const
}

export function useAgentDiscoveryProvisioning(vaultId: string) {
  const permissions = useAuthStore((state) => state.permissions)
  const canManageVault = (permissions & PERMISSION_VAULT_MANAGE) !== 0
  const query = useQuery({
    queryKey: agentDiscoveryProvisioningQueryKey(vaultId),
    queryFn: () => getAgentDiscoveryProvisioning(vaultId),
    enabled: canManageVault,
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.items.some(
      (agent) => agent.status === DISCOVERY_STATUS_PENDING,
    ) ? PENDING_DISCOVERY_REFETCH_INTERVAL_MS : false,
  })
  return { ...query, data: query.data?.items, canManageVault }
}
