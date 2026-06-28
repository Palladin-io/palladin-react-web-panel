# Feature: vaults

**Path:** `src/features/vaults/` — largest feature (~25 components).

## What it does
Vault and entry management. Hierarchy: vault list → vault detail (tabs: Entries / Agents / Audit / Members / Settings) → entry detail (tabs: Details / Agents / Logs).

## Key components / hooks / queries
- Pages: `vault-list-page.tsx`, `vault-detail-page.tsx`, `entry-detail-page.tsx`, `vault-settings-page.tsx`.
- Tabs: `vault-detail-tabs.tsx` (canonical tab-strip reference), `vault-entries-tab.tsx`, `entry-logs-tab.tsx`.
- Panels/rows: `vault-list-panel.tsx`, `vault-entries-panel.tsx`, `entry-row.tsx`.
- Modals/forms: `create-entry-modal.tsx`, `vault-settings-form.tsx`.
- Hooks/queries: `useVaults`, `useVault`, `useEntries` (exported via barrel for `audit`).

## Patterns
- **Zero-knowledge on-demand:** `unsealVaultKey` + `decryptEntry` run in `entry-row.tsx` on reveal and in `entry-detail-page.tsx` on open; plaintext lives in `useState` only.
- **Two-step resource creation** for vault icon upload (create → get ID → PATCH via S3 presign).
- Split-view layout (×3 pages). Inline tab strip in `entry-detail-page.tsx:255` (candidate for `DetailTabBar`).

## Cross-feature deps
- Imports `OrgGrantsPanel` and grant dialogs from `grants` for the Agents tabs.
- Exports `useVaults`/`useVault`/`useEntries` consumed by `audit`.
