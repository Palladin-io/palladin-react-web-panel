import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { PERMISSION_VAULT_MANAGE } from '../../shared/lib/permissions'
import { getAgentDiscoveryProvisioning } from './api/agent-discovery-api'

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
  })
  return { ...query, canManageVault }
}
