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
 * **Always resolves** — 409 (vault already exists) and any network /
 * server error are silently ignored so this call never blocks the
 * onboarding or registration flow. Safe to call multiple times
 * (idempotent on the backend). Shared by onboarding (OAuth) and email+password
 * registration, so it lives in `shared/` rather than a feature folder.
 */
export async function createDefaultVaultSafe(
  privateKey: Uint8Array,
  name: string,
): Promise<void> {
  try {
    const auth = useAuthStore.getState()
    if (!auth.userId || !auth.accessToken) return
    const organizationId = parseJwtPayload(auth.accessToken)['org_id']
    if (typeof organizationId !== 'string') return
    const [challenge, account] = await Promise.all([issueVaultCreationChallenge(), getAccount()])
    if (!account.memberKeyVersion) return
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
  } catch {
    // Non-fatal: vault already exists (409) or creation failed for
    // another reason. The flow continues; user can add a vault manually.
  }
}
