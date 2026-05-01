import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sealVaultKey } from '../../shared/crypto/vault-key'
import { useAuthStore } from '../auth'
import { createVault } from './api/vault-api'
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
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) {
        throw new VaultLockedError()
      }

      const wrappedVK = await sealVaultKey(privateKey)
      return createVault({ ...input, wrappedVK })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
    },
  })
}
