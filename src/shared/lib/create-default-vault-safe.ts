import { createDefaultVault, getAccountForSession } from '../api/account-api'
import { createVaultProtocolPayload } from '../crypto/create-vault-protocol'
import { parseJwtPayload } from './jwt'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  type AuthenticatedSessionSnapshot,
} from '../../features/auth/session/session-boundary'
import { issueVaultCreationChallenge } from '../../features/vaults/api/vault-api'

// Defaults mirror those in vault-presentation.ts but are kept here as
// literals to avoid a cross-feature import.
const DEFAULT_ICON = 'shield'
const DEFAULT_COLOR = '#EB4747'

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
  session: AuthenticatedSessionSnapshot = captureAuthenticatedSession(),
): Promise<DefaultVaultCreationResult> {
  try {
    if (!session.userId || !session.accessToken
      || session.sessionBoundaryActive
      || !authenticatedSessionMatches(session)) return 'failed'
    const organizationId = parseJwtPayload(session.accessToken)['org_id']
    if (typeof organizationId !== 'string') return 'failed'
    const [challenge, account] = await Promise.all([
      issueVaultCreationChallenge(session),
      getAccountForSession(session),
    ])
    if (!authenticatedSessionMatches(session)) return 'failed'
    if (!account.memberKeyVersion) return 'failed'
    const payload = await createVaultProtocolPayload({
      organizationId,
      vaultId: challenge.vaultId,
      memberId: session.userId,
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
    if (!authenticatedSessionMatches(session)) return 'failed'
    await createDefaultVault(payload, session)
    if (!authenticatedSessionMatches(session)) return 'failed'
    return 'created'
  } catch (error) {
    // The backend uniqueness constraint makes the operation idempotent. An
    // ambiguous first request followed by 409 therefore counts as success.
    if (typeof error === 'object' && error !== null && 'response' in error
      && (error as { response?: { status?: number } }).response?.status === 409) {
      return 'already-exists'
    }
    return 'failed'
  }
}
