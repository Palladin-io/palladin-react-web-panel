# Feature: api-keys

**Path:** `src/features/api-keys/`

## What it does
Org API-key management. Master/detail split view (structurally identical to `agents`): key list on the left, key detail (tabs: Details / Agents) on the right. Generate and revoke keys.

## Key components / hooks / queries
- Page: `api-keys-page.tsx` (split-view).
- `api-key-list-panel.tsx`, `api-key-detail-tabs.tsx` (diverged copy of `vault-detail-tabs`), `api-key-agents-tab.tsx`.
- `GenerateApiKeyModal` — two-step: create key → show once-only value via `SecretInput`.
- `RevokeApiKeyDialog` — confirm flow.
- `use-api-key-agents.ts` — cursor-paginated agents for a key.

## Patterns
- Reuses `AgentCard` imported from `agents` in the Agents tab.
- Once-shown secret value displayed through `SecretInput`.
- Key display follows prefix+suffix standard (`pl_••••{keySuffix}`).

## Cross-feature deps
- Imports `AgentCard` from `agents`.
- `api-key-detail-tabs.tsx` duplicates the vaults tab strip (candidate for `DetailTabBar`).
