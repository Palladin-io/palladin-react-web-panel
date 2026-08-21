# Feature: api-keys

**Path:** `src/features/api-keys/`

## What it does
Org API-key management: generate keys, view which agents last used each key, and revoke keys.

## How it's organized
A Settings-hosted split-view — key list on the left, key detail (tabs: Details / Agents) on the right. `ResponsiveMasterDetail` provides wide dual-column and narrow route-driven drill-in behavior. The Agents tab is a cursor-paginated list. Generation is a two-step modal (create → reveal the once-only secret), and revocation is a confirm dialog.

## Key patterns
- **Reuses `AgentCard` from `agents`** in the Agents tab — concrete cross-feature component reuse.
- The freshly generated secret is shown exactly once through `SecretInput`; afterwards only the prefix+suffix hint (`pl_••••{keySuffix}`) is displayed.
- The detail tab strip is a diverged copy of the vaults tab strip — a candidate for the shared `DetailTabBar`.
- Canonical routes are `/settings/api-keys` and `/settings/api-keys/:keyId`; legacy `/api-keys*` routes redirect while preserving the selected key ID.

## Cross-feature deps
Imports `AgentCard` from `agents`.
