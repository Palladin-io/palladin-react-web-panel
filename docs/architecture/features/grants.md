# Feature: grants

**Path:** `src/features/grants/` — the highest cross-feature dependency in the app.

## What it does
The access-control surface: agents request access to vaults/entries, and admins approve or deny those requests. Approval is where the zero-knowledge crypto re-wrapping happens.

## How it's organized
Two split-view route pages — a per-vault grant master/detail view and an org-wide pending-approvals queue alongside an org grants panel. The approval dialog is the heaviest piece; a policy-fields component captures the time/IP/use-count/lifetime matrix (with a `DateTimePicker`); a grant-access dialog initiates requests from the vault side.

## Key patterns
- **Crypto on approve, two modes:** FULL wraps the vault key to the agent's public key (`crypto_box_seal`); GRANULAR generates a DEK, re-encrypts the entry blob, and wraps the DEK. All inside the dialog submit handler — keys never leave memory.
- **Protocol 2 boundary:** `OrgGrantsPanel` accepts `allowRegrant={false}` for migrated Vault surfaces. This preserves revoke and terminal grant history while withholding the legacy regrant affordance that can wrap a VK. Other consumers retain the existing behavior until their dedicated protocol migration lands.
- Split-view layout (2 pages).
- The policy fields hold an unexported select-class constant — a candidate for the shared `FormSelect`.

## Cross-feature deps
The org grants panel, grant-access dialog, and approve/deny dialogs are **exported and consumed by `vaults`** (entry/vault Agents tabs) and **`notifications`** (inline approve/deny). Changes here ripple into both.
