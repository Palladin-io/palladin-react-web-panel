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

## Dashboard getting-started checklist

The post-unlock checklist belongs to `features/dashboard`, not the account key-setup wizard.
It has three steps: first Entry/import, register an Agent, and optional mobile setup.
There is no separate API-key step or API-key-list dependency. Registration completes only
when the standard Agents query contains an `active` Agent, never on message copy or pending enrollment.
The dashboard route composes the existing Agents-owned `AddAgentDialog` through an
`onRegisterAgent` callback; no duplicate message generator or cross-feature dialog import
is added to Dashboard. Opening requires AgentManage and either ReadApiKey or WriteApiKey,
while WriteApiKey controls the existing-key prerequisite hint. A write-only user can create
a new key during approval without reading or selecting existing keys. Key selection/creation happens at approval;
manual API-key management remains available in settings.
