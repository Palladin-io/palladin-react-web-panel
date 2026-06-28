# Feature: grants

**Path:** `src/features/grants/` — highest cross-feature dependency in the app.

## What it does
Two route-level pages: `GrantsPage` (per-vault grant master/detail) and `PendingGrantsPage` (org-wide approvals queue + `OrgGrantsPanel`). Approve/deny grant requests and run the crypto wrapping on approval.

## Key components / hooks / queries
- Pages: `grants-page.tsx`, `pending-grants-page.tsx` (both split-view).
- `org-grants-panel.tsx`, `pending-grants-panel.tsx`, `grant-list-panel.tsx`, `grant-detail.tsx`.
- `ApproveGrantDialog` — heaviest component; branches **FULL** (wrap VK with agent pubkey via `crypto_box_seal`) vs **GRANULAR** (generate DEK, re-encrypt entry blob, wrap DEK). `DenyGrantDialog`.
- `grant-policy-fields.tsx` — time/IP/use-count/lifetime matrix, uses `DateTimePicker`. Holds unexported `SELECT_CLASS` (candidate for `FormSelect`).
- `GrantAccessDialog` — initiate access from the vault side.

## Patterns
- Crypto runs inside the dialogs' submit handlers (still client-side, keys never leave memory).
- Split-view layout (×2).

## Cross-feature deps
- `OrgGrantsPanel`, `GrantAccessDialog`, `ApproveGrantDialog`, `DenyGrantDialog` exported and consumed by `vaults` (entry/vault Agents tabs) and `notifications` (inline approve/deny).
