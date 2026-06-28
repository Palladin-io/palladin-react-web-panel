# Feature: audit

**Path:** `src/features/audit/`

## What it does
Audit-log viewer. Full-width (non-split-view) org-wide log, plus embedded vault-scoped and entry-scoped variants.

## Key components / hooks / queries
- `audit-log-list.tsx` — log rows with cursor pagination.
- `AuditFilterBar` — server-side filters (eventType, agentId, userId, vaultId, date range) via `TypeFilterDropdown` + `DateTimePicker`.
- `audit-event-config.ts` — color taxonomy; `tone()` maps event type → `--cv-*` token (canonical for audit colors).
- `useOrgAuditLogs` — cursor-paginated query. Client-side free-text filter over loaded pages.
- Embedded: `vault-detail-audit-log.tsx` (vault-scoped), `entry-logs-tab.tsx` (entry-scoped, lives under vaults).

## Patterns
- Server-side filter params + client-side text search over loaded pages.
- CSV export button present but disabled (pending CVT-141).

## Cross-feature deps
- Consumes `useVaults`/`useVault` from `vaults` for the vault filter and embedded views.
- Color parity with mobile required — see `.claude/memory/reference_audit_log_colors.md`.
