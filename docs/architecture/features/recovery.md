# Feature: recovery

**Path:** `src/features/recovery/`

## What it does
Three-step account-recovery / re-key flow when the user has lost their master password but holds the recovery phrase.

## Steps / key components
- Step 1 — enter the 12-word mnemonic (`FormTextarea`).
- Step 2 — set a new master password.
- Step 3 — display the new recovery key.
- `recovery-page.tsx` — orchestrator, wrapped in `RecoveryShell` layout.
- `use-recover.ts` — full crypto re-key cycle (validate phrase, re-derive, re-wrap keys server-side).

## Patterns
- Auth-surface group: dark gradient, `AuthSubmitButton`, `RecoveryShell` layout.
- Crypto in the hook only.

## Cross-feature deps
- Shares the `RecoveryShell` layout primitive with `onboarding`.
