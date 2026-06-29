# Feature: audit

**Path:** `src/features/audit/`

## What it does
The audit-log viewer: a searchable, filterable record of who did what. Exists as a full-width org-wide log and as embedded vault-scoped and entry-scoped variants.

## How it's organized
A paginated log list with a filter bar above it. Filtering is **server-side** (event type, agent, user, vault, date range) via the shared filter dropdown and date picker; a **client-side** free-text search runs over the already-loaded pages. Event colors are centralized in an event-config module whose `tone()` helper maps each event type to a `--cv-*` token (the canonical audit color source). The same list renders embedded inside the vaults feature for vault- and entry-scoped views.

## Key patterns
- Server-side filter params + client-side text search over loaded pages; cursor pagination.
- CSV export is stubbed/disabled (pending CVT-141).
- Audit colors must match mobile — never hardcode hex; see `styling.md` and the monorepo color reference.

## Cross-feature deps
Consumes vault queries from `vaults` for the vault filter and embedded views.
