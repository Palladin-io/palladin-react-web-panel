# Feature: recovery

**Path:** `src/features/recovery/`

## What it does
Account recovery when the user has lost their master password but still holds the recovery phrase. Re-keys the account end-to-end and issues a fresh recovery key plus a fresh Account Secret.

## How it's organized
A four-step flow inside the shared recovery-shell layout: enter the mnemonic, set a new master password, display the new recovery key, then display and confirm backup of the new Account Secret. A single recovery hook decrypts the private key locally and uploads only fresh AuthCredential and wrapped ciphertext under CAS revisions.

## Key patterns
- **Auth-surface group:** dark gradient, `AuthSubmitButton`, recovery-shell layout.
- **Crypto isolation:** all key work in the recovery hook, never in step JSX.
- Mnemonic entry uses `FormTextarea`.

## Cross-feature deps
Shares the recovery-shell layout with `onboarding`.
