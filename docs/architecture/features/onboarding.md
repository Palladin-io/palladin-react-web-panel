# Feature: onboarding

**Path:** `src/features/onboarding/`

## What it does
First-run wizard, gated by `!isOnboarded`. Sets up Identity KDF v2 and walks the user through backing up both the recovery key and Account Secret before entering the app.

## How it's organized
A four-step flow: (1) choose master password; (2) display the BIP39 recovery mnemonic; (3) confirm the phrase; (4) display and confirm backup of the generated 32-byte Account Secret. The setup hook runs Identity KDF v2, generates the libsodium keypair and uploads only wrapped key material.

## Key patterns
- **Auth-surface group:** dark gradient, `AuthSubmitButton`, recovery-shell layout shared with `recovery`.
- **Crypto isolation:** key derivation, keypair generation, and key wrapping happen in the setup hook; keys land in Zustand memory only.
- Form fields use `FormInput` / `SecretInput` / `PasswordStrengthBar` / `FeedbackSlot`.

## Cross-feature deps
- Shares the recovery-shell layout with `recovery`.
- Reads/writes `useAuthStore` (`isOnboarded`).
