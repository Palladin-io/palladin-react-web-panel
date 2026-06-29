# Feature: recovery

**Path:** `src/features/recovery/`

## What it does
Account recovery when the user has lost their master password but still holds the recovery phrase. Re-keys the account end-to-end and issues a fresh recovery key.

## How it's organized
A three-step flow inside the shared recovery-shell layout: enter the 12-word mnemonic, set a new master password, then display the new recovery key. A single recovery hook owns the full crypto re-key cycle (validate phrase → re-derive master key → re-wrap the user's keys server-side).

## Key patterns
- **Auth-surface group:** dark gradient, `AuthSubmitButton`, recovery-shell layout.
- **Crypto isolation:** all key work in the recovery hook, never in step JSX.
- Mnemonic entry uses `FormTextarea`.

## Cross-feature deps
Shares the recovery-shell layout with `onboarding`.
