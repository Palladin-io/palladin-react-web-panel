# Feature: onboarding

**Path:** `src/features/onboarding/`

## What it does
First-run wizard, gated by `!isOnboarded`. Sets up the user's master password and walks them through backing up the recovery key before they reach the app.

## How it's organized
A three-step flow inside a shared recovery-shell layout: (1) choose master password — derives a 256-bit master key with Argon2id and generates the libsodium keypair; (2) display the BIP39 recovery mnemonic; (3) confirm the phrase was written down. All cryptographic work lives in a dedicated setup hook, never inline in step JSX.

## Key patterns
- **Auth-surface group:** dark gradient, `AuthSubmitButton`, recovery-shell layout shared with `recovery`.
- **Crypto isolation:** key derivation, keypair generation, and key wrapping happen in the setup hook; keys land in Zustand memory only.
- Form fields use `FormInput` / `SecretInput` / `PasswordStrengthBar` / `FeedbackSlot`.

## Cross-feature deps
- Shares the recovery-shell layout with `recovery`.
- Reads/writes `useAuthStore` (`isOnboarded`).
