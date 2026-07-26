import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { createInitialVaultMaterial } from '../../shared/crypto/vault-v2-creation'
import { parseJwtPayload } from '../../shared/lib/jwt'
import { getAccount } from '../../shared/api/account-api'
import { useAuthStore } from '../auth'
import { createVault, issueVaultCreationChallenge, type CreateVaultPayload } from './api/vault-api'
import type { CreateVaultInput } from './types'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { listEncryptedVaults } from './sync/member-sync-api'
import { useMemberSyncStore } from './sync/member-sync-store'

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
  const pendingAttempt = useRef<CreateVaultPayload | null>(null)

  return useMutation({
    mutationFn: async (input: CreateVaultInput) => {
      // Read the private key inside the mutation (not at hook level) so we
      // pick up the latest value at click time — `unlockVault` may have
      // populated it after the hook was first instantiated.
      const auth = useAuthStore.getState()
      if (!auth.privateKey || !auth.userId || !auth.accessToken) {
        throw new VaultLockedError()
      }
      const organizationId = parseJwtPayload(auth.accessToken)['org_id']
      if (typeof organizationId !== 'string') throw new Error('Authenticated organization is missing')

      const challenge = await issueVaultCreationChallenge()
      if (pendingAttempt.current && pendingAttempt.current.vaultId !== challenge.vaultId) {
        const vaults = await listEncryptedVaults()
        if (vaults.some((vault) => vault.id === pendingAttempt.current?.vaultId)) {
          const vaultId = pendingAttempt.current.vaultId
          pendingAttempt.current = null
          return { vaultId }
        }
        pendingAttempt.current = null
      }
      if (pendingAttempt.current?.vaultId !== challenge.vaultId) {
        const account = await getAccount()
        if (!account.memberKeyVersion) throw new Error('Current Member key version is missing')
        pendingAttempt.current = await createInitialVaultMaterial({
          organizationId,
          vaultId: challenge.vaultId,
          memberId: auth.userId,
          memberKeyVersion: account.memberKeyVersion,
          memberPrivateKey: auth.privateKey,
          metadata: {
            name: input.name,
            ...(input.description ? { description: input.description } : {}),
            ...(input.icon ? { iconReference: input.icon } : {}),
            ...(input.color ? { color: input.color } : {}),
          },
        })
      }

      const attempt = pendingAttempt.current
      try {
        await createVault(attempt)
      } catch (error) {
        try {
          if ((await listEncryptedVaults()).some((vault) => vault.id === attempt.vaultId)) {
            pendingAttempt.current = null
            return { vaultId: attempt.vaultId }
          }
        } catch {
          // Preserve the exact ciphertext attempt for an idempotent retry.
        }
        if (error instanceof HTTPError && error.response.status < 500
          && error.response.status !== 408 && error.response.status !== 429) {
          pendingAttempt.current = null
        }
        throw error
      }
      pendingAttempt.current = null
      return { vaultId: attempt.vaultId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      useMemberSyncStore.getState().retry()
    },
  })
}
