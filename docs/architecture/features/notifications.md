# Feature: notifications

**Path:** `src/features/notifications/` — the highest cross-feature _consumer_.

## What it does

The Notification Center inbox plus the app's real-time plumbing. Surfaces grant/agent/system events and lets the user act on actionable ones inline. Also owns the SignalR connection and Web Push registration that drive live updates across the whole app.

## How it's organized

A segmented inbox (All / To-do / History / Grants) with search and the shared filter dropdown. Cards are immutable log entries; pending-grant and pending-agent cards embed inline approve/deny actions. A preferences dialog manages per-channel settings. The real-time layer is a singleton SignalR provider plus an invalidation hook that turns hub events into TanStack Query cache invalidations, and a Web Push hook for VAPID subscription registration.

## Key patterns

- **Two complementary channels:** SignalR (in-app, tab open) and FCM-for-Web push (system notification, tab closed).
- **Generic wire contract:** FCM carries only type/category/opaque subject/time; SignalR and Inbox may additionally carry structural opaque IDs. Server title/body, presentation names and deep links are never trusted or rendered.
- **Local resolution after unlock:** Vault and Entry presentation comes only from the in-memory Member sync store; Agent presentation comes from the authorized Agent cache. Missing/deleted references use prefix-and-suffix IDs.
- **Grant history enrichment:** structural notification IDs select authoritative Grant rows; `EncryptedReason` is decrypted only with the unlocked in-memory session key and actor IDs are resolved through the Vault member directory. Notification-supplied plaintext reason/actor names are stripped, never trusted, persisted, or logged.
- **Bounded cross-channel deduplication:** foreground FCM and SignalR occurrences share a bounded two-minute identity window keyed by type, subject and occurrence time.
- **Authorization-preserving navigation:** internal routes are constructed locally from opaque IDs. Opening a notification still passes through normal route guards and authorized endpoints.

## Cross-feature deps

Reuses the approve/deny dialogs from `grants` and `agents` for inline actions, and their queries to resolve card context. It pulls from the most other features of any surface.
