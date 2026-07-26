# Feature: unlock

**Path:** `src/features/unlock/`

## What it does
The lock screen — the sole reachable route while `isVaultLocked === true`. Identity v2 takes the master password plus Account Secret, re-derives MK, and decrypts the member private key back into memory. Legacy accounts are forced through the client-side KDF migration before resuming.

## How it's organized
One dark-forced page with password and optional Account Secret fields. The unlock hook validates the authenticated KDF state, derives via the registered v2 or legacy profile, decrypts the stored private key, and writes independent key copies into Zustand. A successful legacy unlock displays the Account Secret backup/migration step and retries the exact same migration payload after interruption.

## Key patterns
- **Non-persisted lock state:** `isVaultLocked` is never persisted; it starts `true` on every load and is only flipped `false` by `unlockVault()`. This is the security-critical routing primitive.
- **Auth-surface page:** dark gradient + `class="dark"`; `FormInput`, `FieldFeedback`, `AuthSubmitButton`.

## Cross-feature deps
Reads/writes `useAuthStore` (`isVaultLocked`, key setters). All route guards depend on this flag.
