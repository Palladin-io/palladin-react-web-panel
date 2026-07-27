import { createDefaultVault, getAccount } from '../api/account-api'
import { createVaultProtocolPayload } from '../crypto/create-vault-protocol'
import { parseJwtPayload } from './jwt'
import { useAuthStore } from '../../features/auth'
import { issueVaultCreationChallenge } from '../../features/vaults/api/vault-api'

// Defaults mirror those in vault-presentation.ts but are kept here as
// literals to avoid a cross-feature import.
const DEFAULT_ICON = 'shield'
const DEFAULT_COLOR = '#EB4747'

/**
 * Generates a fresh Vault Key, seals it for the user, and creates the
 * default vault via POST /api/account/default-vault.
 *
 * Returns true when creation succeeded or the backend reports that the
 * default Vault already exists. Other failures return false so the caller can
 * retry while the unlocked private key is still available in memory.
 */
export async function createDefaultVaultSafe(
  privateKey: Uint8Array,
  name: string,
): Promise<boolean> {
  try {
    const auth = useAuthStore.getState()
    if (!auth.userId || !auth.accessToken) return false
    const organizationId = parseJwtPayload(auth.accessToken)['org_id']
    if (typeof organizationId !== 'string') return false
    const [challenge, account] = await Promise.all([issueVaultCreationChallenge(), getAccount()])
    if (!account.memberKeyVersion) return false
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
        icon: { kind: 'glyph', value: DEFAULT_ICON },
        color: DEFAULT_COLOR,
        grantMode: 'granular',
      },
    })
    await createDefaultVault(payload)
    return true
  } catch (error) {
    // The backend uniqueness constraint makes the operation idempotent. An
    // ambiguous first request followed by 409 therefore counts as success.
    if (typeof error === 'object' && error !== null && 'response' in error
      && (error as { response?: { status?: number } }).response?.status === 409) {
      return true
    }
    return false
  }
}
