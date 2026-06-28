# Feature: onboarding

**Path:** `src/features/onboarding/`

## What it does
Three-step first-run wizard, gated by `!isOnboarded`. Sets up the master password and backs up the recovery key.

## Steps / key components
- `MasterPasswordStep` — derives a 256-bit MK with Argon2id, generates a libsodium keypair. Uses `FormInput`, `SecretInput`, `PasswordStrengthBar`, `FeedbackSlot`.
- `RecoveryKeyStep` — displays the BIP39 mnemonic.
- `RecoveryKeyConfirmStep` — validates the user wrote the phrase down.
- `use-complete-setup.ts` — all crypto lives here (key derivation, keypair, wrapping); never inline in JSX.

## Patterns
- Auth-surface group (shares `RecoveryShell`-style layout, `AuthSubmitButton`, dark gradient).
- Crypto strictly in the hook, keys to Zustand memory only.

## Cross-feature deps
- Shares the recovery-shell layout primitive with `recovery`.
- Reads/writes `useAuthStore` (`isOnboarded`).
