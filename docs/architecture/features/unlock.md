# Feature: unlock

**Path:** `src/features/unlock/`

## What it does
Single dark-forced screen; the sole entry point when `isVaultLocked === true`. Re-derives the master key from the password and decrypts the user's private key into memory.

## Key components / hooks
- `unlock-page.tsx` — password form (`FormInput`, `FieldFeedback`, `AuthSubmitButton`).
- Unlock flow: derive MK via Argon2id (salt from `/account`) → decrypt `encrypted_private_key` → store MK + private key in Zustand memory only.
- `unlock-page.test.tsx` — co-located test (one of the few feature tests present).

## Patterns
- `isVaultLocked` is **non-persisted** Zustand: always starts `true` on load, only set `false` by `unlockVault()`.
- Auth-surface page: dark gradient + `class="dark"`.

## Cross-feature deps
- `useAuthStore` (`isVaultLocked`, key setters). Route guards depend on this flag.
