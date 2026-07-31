import { parseJwtPayload } from '../../shared/lib/jwt'
import { useAuthStore } from '../auth'
import { GRANT_MODE_GRANULAR, type Vault } from './types'
import { useMemberSyncStore } from './sync/member-sync-store'
import { presentationIconReference } from '../../shared/crypto/vault-plaintext'

export function vaultQueryKey(id: string) {
  return ['vaults', id] as const
}

function organizationIdFrom(token: string | null): string | undefined {
  if (!token) return undefined
  try {
    const organizationId = parseJwtPayload(token)['org_id']
    return typeof organizationId === 'string' ? organizationId : undefined
  } catch {
    return undefined
  }
}

export function useVault(id: string) {
  const record = useMemberSyncStore((state) => state.vaults.get(id))
  const status = useMemberSyncStore((state) => state.status)
  const retry = useMemberSyncStore((state) => state.retry)
  const token = useAuthStore((state) => state.accessToken)
  const organizationId = organizationIdFrom(token)
  const metadata = record?.metadata
  const data: Vault | undefined = record && metadata && organizationId
    ? {
        id,
        organizationId,
        name: metadata.name,
        description: metadata.description ?? null,
        icon: presentationIconReference(metadata.icon) ?? null,
        color: metadata.color ?? null,
        grantMode: GRANT_MODE_GRANULAR,
        createdAt: record.structure.createdAt,
        updatedAt: record.structure.updatedAt,
        entryCount: record.structure.entryCount,
        activeGrantCount: record.structure.activeGrantCount,
        memberCount: record.structure.memberCount,
      }
    : undefined
  return {
    data,
    isPending: !record && (status === 'idle' || status === 'syncing'),
    isError: record
      ? Boolean(record.failureKind === 'metadata' || !metadata)
      : status === 'error',
    refetch: async () => { retry() },
  }
}
