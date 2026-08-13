# Feature: audit

**Path:** `src/features/audit/`

## What it does
The audit-log viewer: a searchable, filterable record of who did what. Exists as a full-width org-wide log and as embedded vault-scoped and entry-scoped variants.

## How it's organized
A paginated log list with a filter bar above it. Filtering is **server-side** (event type, agent, user, vault, date range) via the shared filter dropdown and date picker; a **client-side** free-text search runs over the already-loaded pages. Vault audit rows carry opaque entry IDs. Their labels are resolved only from the unlocked in-memory Member index, including retained soft-deleted records; unavailable, purged or corrupt records render as shortened prefix-and-suffix hints. Those decrypted labels are never sent back as filter or export parameters. Event colors are centralized in an event-config module whose `tone()` helper maps each event type to a `--cv-*` token (the canonical audit color source). The same list renders embedded inside the vaults feature for vault- and entry-scoped views and inside Agent Detail with a fixed server-side `agentId`.

## Key patterns
- Server-side filter params + client-side text search over loaded pages; cursor pagination.
- Opaque entry IDs resolve from `member-sync-store`; lock clears the resolver source and no plaintext is persisted by Audit.
- `useOrgAuditResourceNames` centralizes local Vault/Entry labels and filter options for both global and agent-scoped org logs.
- CSV export is stubbed and disabled until the backend async-export job is available.

## Cross-feature deps
Consumes the in-memory Vault Member index for local presentation/filter labels. Its shared components and org-query hooks are consumed by the Agent Detail Logs tab.

## Audit Log color taxonomy

When touching Audit Log UI (event colors, legend, badges), this is the
canonical mapping. Keep web and mobile clients aligned with these semantic
roles.

Semantic roles map to `--cv-*` tokens (defined in `src/index.css`, consumed via `tone()` in `src/features/audit/components/audit-event-config.ts`):

| Role | Token | Value |
|------|-------|-------|
| Success / approved | `--cv-success` | `#10B981` |
| Pending / request access (`grant.requested`) | `--cv-pending` | `#FFAB87` |
| Info | `--cv-info` | `#60A5FA` |
| Danger | `--cv-primary` | `#EB4747` |
| Neutral | `--cv-neutral` | `#8A95A6` |

Rules:
- **Never hardcode hex** — always go through `tone()` / the tokens.
- Green is `#10B981` (never `#2EC4B6`).
- `agent.enrolled` = info / blue.
- Pending / peach = `grant.requested` (request access).
