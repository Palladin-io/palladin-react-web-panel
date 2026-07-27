import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAgent } from '../agents/api/agents-api'
import { useAuthStore } from '../auth'
import { getOrgGrants, GRANT_STATUS_ACTIVE } from '../grants/api/org-grants-api'
import { grantMethodsBits, type GrantMethod } from '../grants/grant-methods'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import type { MemberSecretV1 } from '../../shared/crypto/vault-plaintext'
import { updateEntry } from './api/vault-api'
import type { EntryDetail, Vault } from './types'
import { entriesQueryKey, entryDetailQueryKey } from './use-entries'

export interface UpdateEntryInput {
  vault: Vault
  entry: EntryDetail
  memberSecret: MemberSecretV1
}

export async function updateCanonicalEntry({ vault, entry, memberSecret }: UpdateEntryInput) {
  const vaultId = vault.id
  const entryId = entry.id
  const auth = useAuthStore.getState()
  const vaultKey = auth.getVaultKey(vaultId)
  const discoveryKey = auth.getVaultDiscoveryKey(vaultId)
  if (!vaultKey || !discoveryKey) throw new Error('Vault is locked')
  const revision = (BigInt(entry.currentRevision) + 1n).toString()
  const envelopes = await sealCanonicalEntry({ organizationId: vault.organizationId, vaultId, entryId, revision,
    vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion, vdkVersion: vault.currentKeyEpoch.vdkVersion,
    memberKeyGeneration: vault.memberKeyGeneration }, memberSecret, vaultKey, discoveryKey, 2)
  const covering = []
  let cursor: string | undefined
  do {
    const page = await getOrgGrants({ vaultId, status: GRANT_STATUS_ACTIVE, cursor, pageSize: 100 })
    covering.push(...page.items.filter((grant) => grant.type === 'full' || grant.entryId === entryId))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  const grantEnvelopes = await Promise.all(covering.map(async (grant) => {
    if (!grant.agentId) throw new Error('Active grant is missing its Agent identifier')
    const agent = await getAgent(grant.agentId)
    if (!agent.publicKey) throw new Error('Active grant Agent is missing its public key')
    return buildCanonicalGrantEnvelope({ organizationId: vault.organizationId, vaultId, entryId, grantId: grant.id,
      agentId: grant.agentId, entryRevision: revision, memberKeyGeneration: vault.memberKeyGeneration,
      agentPublicKey: agent.publicKey, recipientKeyVersion: agent.recipientKeyVersion,
      approvedMethods: grantMethodsBits(parseMethods(grant.methods)), expiresAt: grant.expiresAt ?? undefined,
      remainingUses: grant.queryLimit == null ? undefined : grant.queryLimit - (grant.queryCount ?? 0), secret: memberSecret })
  }))
  return updateEntry(vaultId, entryId, { baseRevision: entry.currentRevision, newEntryKey: envelopes.entryKey,
    memberSecret: envelopes.memberSecret, memberIndex: envelopes.memberIndex, agentDiscoveryChanged: true,
    agentDiscovery: envelopes.agentDiscovery, grantEnvelopes })
}

function parseMethods(value?: string | null): GrantMethod[] {
  const methods = (value ?? '').split(',').map((item) => item.trim().toLowerCase())
  return methods.filter((item): item is GrantMethod => item === 'get' || item === 'exec' || item === 'inject')
}

export function useUpdateEntry(vaultId: string, entryId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateCanonicalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryDetailQueryKey(vaultId, entryId) })
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(vaultId) })
      queryClient.invalidateQueries({ queryKey: ['entries', 'recent'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}
