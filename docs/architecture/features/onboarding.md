# Feature: onboarding

**Path:** `src/features/onboarding/`

## What it does
First-run wizard, gated by `!isOnboarded`. Sets up Identity password KDF v1 and walks the user through backing up the recovery key before entering the app.

## How it's organized
A three-step flow: (1) choose master password; (2) display the BIP39 recovery mnemonic; (3) confirm the phrase. The setup hook runs Identity password KDF v1, generates the libsodium keypair and uploads only wrapped key material.

## Key patterns
- **Auth-surface group:** dark gradient, `AuthSubmitButton`, recovery-shell layout shared with `recovery`.
- **Crypto isolation:** key derivation, keypair generation, and key wrapping happen in the setup hook; keys land in Zustand memory only.
- Form fields use `FormInput` / `SecretInput` / `PasswordStrengthBar` / `FeedbackSlot`.

## Cross-feature deps
- Shares the recovery-shell layout with `recovery`.
- Reads/writes `useAuthStore` (`isOnboarded`).
