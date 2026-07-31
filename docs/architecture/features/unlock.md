# Feature: unlock

**Path:** `src/features/unlock/`

## What it does
The lock screen — the sole reachable route while `isVaultLocked === true`. Identity password KDF v1 takes the master password, re-derives MK, and decrypts the member private key back into memory.

## How it's organized
One dark-forced page with a password field. The unlock hook validates the authenticated KDF state, derives via the registered password-only profile, decrypts the stored private key, and writes independent key copies into Zustand. Unsupported profiles fail closed.

## Key patterns
- **Non-persisted lock state:** `isVaultLocked` is never persisted; it starts `true` on every load and is only flipped `false` by `unlockVault()`. This is the security-critical routing primitive.
- **Auth-surface page:** dark gradient + `class="dark"`; `FormInput`, `FieldFeedback`, `AuthSubmitButton`.

## Cross-feature deps
Reads/writes `useAuthStore` (`isVaultLocked`, key setters). All route guards depend on this flag.
