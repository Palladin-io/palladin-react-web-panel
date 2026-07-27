import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAccount } from '../../shared/api/account-api'
import { createVaultProtocolPayload } from '../../shared/crypto/create-vault-protocol'
import { parseJwtPayload } from '../../shared/lib/jwt'
import { useAuthStore } from '../auth'
import { createVault, issueVaultCreationChallenge } from './api/vault-api'
import type { CreateVaultInput } from './types'
import { VAULTS_QUERY_KEY } from './use-vaults'

/**
 * Thrown when create is invoked while the vault is still locked. The
 * private key only lives in memory after `unlockVault`, so without it
 * we cannot seal the new VK and cannot proceed. Callers (the dialog)
 * should never let this happen — the route guard already redirects to
 * `/unlock` when the vault is locked — but we keep the error class for
 * defence in depth and easier test assertions.
 */
export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked — unlock before creating a vault')
    this.name = 'VaultLockedError'
  }
}

export function useCreateVault() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateVaultInput) => {
      // Read the private key inside the mutation (not at hook level) so we
      // pick up the latest value at click time — `unlockVault` may have
      // populated it after the hook was first instantiated.
      const { privateKey, accessToken, userId } = useAuthStore.getState()
      if (!privateKey || !accessToken || !userId) {
        throw new VaultLockedError()
      }
      const organizationId = parseJwtPayload(accessToken)['org_id']
      if (typeof organizationId !== 'string') throw new Error('Authenticated organization is missing')
      const [challenge, account] = await Promise.all([
        issueVaultCreationChallenge(),
        getAccount(),
      ])
      if (!account.memberKeyVersion) throw new Error('Member key version is missing')
      const payload = await createVaultProtocolPayload({
        vaultId: challenge.vaultId,
        organizationId,
        memberId: userId,
        memberKeyVersion: account.memberKeyVersion,
        memberPrivateKey: privateKey,
        metadata: {
          schema: 'palladin.member-vault-metadata.v1',
          name: input.name.normalize('NFC'),
          description: input.description?.normalize('NFC') ?? null,
          icon: input.icon ? { kind: 'glyph', value: input.icon.normalize('NFC') } : null,
          color: input.color?.toUpperCase() ?? null,
          grantMode: input.grantMode === 1 ? 'full' : 'granular',
        },
      })
      return createVault(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
    },
  })
}
