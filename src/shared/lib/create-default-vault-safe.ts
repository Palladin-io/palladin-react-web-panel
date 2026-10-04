import { createDefaultVault, getAccount } from '../api/account-api'
import { createVaultProtocolPayload } from '../crypto/create-vault-protocol'
import { parseJwtPayload } from './jwt'
import { useAuthStore } from '../../features/auth'
import { issueVaultCreationChallenge } from '../../features/vaults/api/vault-api'
import { PERMISSION_VAULT_MANAGE } from './permissions'

// Defaults mirror those in vault-presentation.ts but are kept here as
// literals to avoid a cross-feature import.
export const DEFAULT_VAULT_ICON = 'shield'
export const DEFAULT_VAULT_COLOR = '#E54645'

/**
 * Generates a fresh Vault Key, seals it for the user, and creates the
 * default vault via POST /api/account/default-vault.
 *
 * Distinguishes a newly created Vault from an existing one. Callers may retry
 * failures while the unlocked private key is still available in memory, but a
 * conflict must not trigger another create/sync loop.
 */
export type DefaultVaultCreationResult = 'created' | 'already-exists' | 'failed'

export async function createDefaultVaultSafe(
  privateKey: Uint8Array,
  name: string,
  signal?: AbortSignal,
): Promise<DefaultVaultCreationResult> {
  try {
    const auth = useAuthStore.getState()
    if (!auth.userId || !auth.accessToken) return 'failed'
    const organizationId = parseJwtPayload(auth.accessToken)['org_id']
    if (typeof organizationId !== 'string') return 'failed'
    const current = () => {
      const state = useAuthStore.getState()
      return !signal?.aborted && !state.isVaultLocked && state.emailVerified && !!state.accessToken
        && state.userId === auth.userId && state.privateKey === privateKey
        && state.cryptoSessionGeneration === auth.cryptoSessionGeneration
        && parseJwtPayload(state.accessToken)['org_id'] === organizationId
        && (state.permissions & PERMISSION_VAULT_MANAGE) !== 0
    }
    if (!current()) return 'failed'
    const [challenge, account] = await Promise.all([issueVaultCreationChallenge(signal), getAccount()])
    if (!current() || !account.memberKeyVersion) return 'failed'
    const payload = await createVaultProtocolPayload({
      organizationId,
      vaultId: challenge.vaultId,
      memberId: auth.userId,
      memberKeyVersion: account.memberKeyVersion,
      memberPrivateKey: privateKey,
      metadata: {
        schema: 'palladin.member-vault-metadata.v1',
        name,
        description: null,
        icon: { kind: 'glyph', value: DEFAULT_VAULT_ICON },
        color: DEFAULT_VAULT_COLOR,
        grantMode: 'granular',
      },
    })
    if (!current()) return 'failed'
    try {
      await createDefaultVault(payload, signal)
      return current() ? 'created' : 'failed'
    } catch (error) {
      // Only the default-creation uniqueness conflict permits reconciliation.
      if (current() && typeof error === 'object' && error !== null && 'response' in error
        && (error as { response?: { status?: number } }).response?.status === 409) return 'already-exists'
      return 'failed'
    }
  } catch {
    return 'failed'
  }
}
