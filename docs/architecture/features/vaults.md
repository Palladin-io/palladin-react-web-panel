# Feature: vaults

**Path:** `src/features/vaults/` — the largest feature.

## What it does
Vault and entry management: the core of the product. Users browse vaults, drill into a vault, and open individual entries to reveal/edit decrypted credentials.

## How it's organized
Three nested levels, each a split-view page with its own tab strip:
- **Vault list** → list panel + create/settings flows.
- **Vault detail** — tabs: Entries / Agents / Audit / Members / Settings.
- **Entry detail** — tabs: Details / Agents / Logs.

Data comes from exported vault/entry queries (`useVaults`, `useVault`, `useEntries`). Entry rows and the entry-detail page own the decrypt-on-demand logic; create/edit flows follow the inline-edit and modal conventions.

## Key patterns
- **Zero-knowledge on-demand:** the vault key is unsealed and the entry decrypted only at reveal/open time; plaintext lives in component `useState` and never leaves memory.
- **Two-step resource creation** for vault icons (create → receive ID → PATCH via S3 presign).
- Split-view layout (3 pages) and an inline entry-detail tab strip — both candidates for the shared `SplitView` / `DetailTabBar` (see component-catalog).

## Cross-feature deps
- Imports `OrgGrantsPanel` and the grant dialogs from `grants` for the Agents tabs.
- Exports `useVaults` / `useVault` / `useEntries`, consumed by `audit`.
