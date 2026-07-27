import { createDefaultVault } from '../api/account-api'
import { sealVaultKey } from '../crypto/vault-key'

// Defaults mirror those in vault-presentation.ts but are kept here as
// literals to avoid a cross-feature import.
const DEFAULT_ICON = 'shield'
const DEFAULT_COLOR = '#EB4747'
// Granular (2) is the safe default: available on all plans, per-entry scope.
const GRANT_MODE_GRANULAR = 2

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
    const wrappedVK = await sealVaultKey(privateKey)
    await createDefaultVault({
      name,
      icon: DEFAULT_ICON,
      color: DEFAULT_COLOR,
      grantMode: GRANT_MODE_GRANULAR,
      wrappedVK,
    })
  } catch {
    // Non-fatal: vault already exists (409) or creation failed for
    // another reason. The flow continues; user can add a vault manually.
  }
}
