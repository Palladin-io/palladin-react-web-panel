# Feature: audit

**Path:** `src/features/audit/`

## What it does
The audit-log viewer: a searchable, filterable record of who did what. Exists as a full-width org-wide log and as embedded Home, Agent, Member, Vault and Entry variants.

## How it's organized
A paginated log list with a filter bar above it. Filtering is **server-side** (event type, agent, user, vault, date range) via the shared filter dropdown and date picker; a **client-side** free-text search runs over the already-loaded pages. Vault audit rows carry opaque entry IDs. Their labels are resolved only from the unlocked in-memory Member index, including retained soft-deleted records; unavailable, purged or corrupt records render as shortened prefix-and-suffix hints. User actors resolve through the shared organization member directory, which retains minimal identities for former members. Those decrypted labels and resolved names are never sent back as filter or export parameters. Event colors are centralized in an event-config module whose `tone()` helper maps each event type to a `--cv-*` token (the canonical audit color source). The same list renders on Home, the global log, and the Agent, Member, Vault and Entry log surfaces.

## Key patterns
- Server-side filter params + client-side text search over loaded pages; cursor pagination.
- Opaque entry IDs resolve from `member-sync-store`; lock clears the resolver source and no plaintext is persisted by Audit.
- User actor IDs resolve from the shared, organization-scoped in-memory directory documented in `../member-directory.md`. Missing visible IDs cause one whole-directory repair refetch, never per-row requests; unresolved actors use shortened prefix-and-suffix IDs.
- `useAuditLogPresentation` is the public presentation boundary. It composes authorized Agent/Member names with local Vault/Entry labels and is passed whole to the required `AuditLogList.presentation` prop. Never select individual resolver props at a call site; extending the presentation model must update every Audit Log surface automatically.
- `useAuditAgentNames` and `useOrgAuditResourceNames` are internal inputs to that presentation model.
- CSV export queues the backend async job, polls its status with capped backoff and downloads the ready file from its short-lived URL.

## Cross-feature deps
Consumes the in-memory Vault Member index for local presentation/filter labels. It exports the Agent and Member Logs panels for app-level route composition, so those features do not depend directly on Audit internals.

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
