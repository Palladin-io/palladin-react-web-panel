# Feature: unlock

**Path:** `src/features/unlock/`

## What it does
The lock screen — the sole reachable route while `isVaultLocked === true`. Identity password KDF v1 takes the master password, re-derives MK, and decrypts the member private key back into memory.

## How it's organized
One theme-aware page with a password field. The unlock hook validates the authenticated KDF state, derives via the registered password-only profile, decrypts the stored private key, and writes independent key copies into Zustand. Unsupported profiles fail closed.

## Key patterns
- **Session ceilings:** `unlockVault` records original memory-only unlock deadlines and accepts verified inherited limits capped by Web policy. Expired limits cannot publish keys, and layout remount/refresh does not renew them. The shared-unlock browser coordinator remains in progress.
- **Non-persisted lock state:** `isVaultLocked` is never persisted; it starts `true` on every load and is only flipped `false` by `unlockVault()`. This is the security-critical routing primitive.
- **Auth-surface page:** `.auth-surface` follows the persisted app theme; `FormInput`, `FieldFeedback`, `AuthSubmitButton`.
- **Deep-link return:** the authenticated guard and session timeout forward the requested internal URL through `/unlock?redirect=…`; both normal unlock and onboarding return to it after keys are restored in memory. Unsafe or looping redirect values fall back to `/`.

## Cross-feature deps
Reads/writes `useAuthStore` (`isVaultLocked`, key setters). All route guards depend on this flag.
