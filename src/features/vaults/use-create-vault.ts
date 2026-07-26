import { useState } from 'react'
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

interface PendingVaultCreationAttempt {
  input: CreateVaultInput
  payload: CreateVaultPayload
}

// Ciphertext-only state deliberately lives in module memory: it survives a dialog
// remount, but never enters persistent browser storage and disappears with the tab.
const pendingAttempts = new Map<string, PendingVaultCreationAttempt>()

function sessionKey(organizationId: string, memberId: string): string {
  return `${organizationId}:${memberId}`
}

function currentSessionKey(): string | null {
  const auth = useAuthStore.getState()
  if (!auth.userId || !auth.accessToken) return null
  const organizationId = parseJwtPayload(auth.accessToken)['org_id']
  return typeof organizationId === 'string' ? sessionKey(organizationId, auth.userId) : null
}

export function useCreateVault() {
  const queryClient = useQueryClient()
  const [pendingInput, setPendingInput] = useState<CreateVaultInput | null>(
    () => {
      const key = currentSessionKey()
      return key ? pendingAttempts.get(key)?.input ?? null : null
    },
  )

  const mutation = useMutation({
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
      const key = sessionKey(organizationId, auth.userId)

      const challenge = await issueVaultCreationChallenge()
      let pendingAttempt = pendingAttempts.get(key)
      if (pendingAttempt && pendingAttempt.payload.vaultId !== challenge.vaultId) {
        const pendingVaultId = pendingAttempt.payload.vaultId
        const vaults = await listEncryptedVaults()
        if (vaults.some((vault) => vault.id === pendingVaultId)) {
          pendingAttempts.delete(key)
          setPendingInput(null)
          return { vaultId: pendingVaultId }
        }
        pendingAttempts.delete(key)
        setPendingInput(null)
        pendingAttempt = undefined
      }
      if (pendingAttempt?.payload.vaultId !== challenge.vaultId) {
        const account = await getAccount()
        if (!account.memberKeyVersion) throw new Error('Current Member key version is missing')
        const normalizedInput: CreateVaultInput = {
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          ...(input.icon ? { icon: input.icon } : {}),
          ...(input.color ? { color: input.color } : {}),
        }
        const payload = await createInitialVaultMaterial({
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
        pendingAttempt = { input: normalizedInput, payload }
        pendingAttempts.set(key, pendingAttempt)
        setPendingInput(normalizedInput)
      }

      const attempt = pendingAttempt.payload
      try {
        await createVault(attempt)
      } catch (error) {
        try {
          if ((await listEncryptedVaults()).some((vault) => vault.id === attempt.vaultId)) {
            pendingAttempts.delete(key)
            setPendingInput(null)
            return { vaultId: attempt.vaultId }
          }
        } catch {
          // Preserve the exact ciphertext attempt for an idempotent retry.
        }
        if (error instanceof HTTPError && error.response.status < 500
          && error.response.status !== 408 && error.response.status !== 429) {
          pendingAttempts.delete(key)
          setPendingInput(null)
        }
        throw error
      }
      pendingAttempts.delete(key)
      setPendingInput(null)
      return { vaultId: attempt.vaultId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      useMemberSyncStore.getState().retry()
    },
  })

  return { ...mutation, pendingInput }
}
