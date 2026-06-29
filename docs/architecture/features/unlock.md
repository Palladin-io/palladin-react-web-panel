# Feature: unlock

**Path:** `src/features/unlock/`

## What it does
The lock screen — the sole reachable route while `isVaultLocked === true`. Takes the master password, re-derives the master key, and decrypts the user's private key back into memory so the session can resume.

## How it's organized
One dark-forced page with a single password field. The unlock flow derives the master key via Argon2id (salt fetched from `/account`), decrypts the stored private key, and writes both keys into the Zustand store. Has a co-located test — one of the few feature-level tests present.

## Key patterns
- **Non-persisted lock state:** `isVaultLocked` is never persisted; it starts `true` on every load and is only flipped `false` by `unlockVault()`. This is the security-critical routing primitive.
- **Auth-surface page:** dark gradient + `class="dark"`; `FormInput`, `FieldFeedback`, `AuthSubmitButton`.

## Cross-feature deps
Reads/writes `useAuthStore` (`isVaultLocked`, key setters). All route guards depend on this flag.
