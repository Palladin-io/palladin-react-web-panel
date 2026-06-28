# Feature: notifications

**Path:** `src/features/notifications/` — highest cross-feature *consumer*.

## What it does
Notification Center inbox at `/notifications`. Four segments (All / To-do / History / Grants) + search + `TypeFilterDropdown`. Manages the SignalR hub and FCM-for-Web push registration.

## Key components / hooks / queries
- `notification-center-page.tsx` — inbox; cards are immutable log entries. `grant_pending` / `agent_pending` cards carry inline Approve/Deny actions.
- `notification-preferences-dialog.tsx` — per-channel preferences.
- `SignalrProvider` — singleton hub connection.
- `useNotificationInvalidation` — dispatches TanStack Query cache invalidations on hub events.
- `use-web-push.ts` — FCM-for-Web VAPID subscription registration.

## Patterns
- Two complementary channels: SignalR (in-app, tab open) + FCM for Web (system push, tab closed).
- Toasts localized client-side from `payload.data` names (EN/PL), fallback to server body.

## Cross-feature deps
- Reuses `ApproveGrantDialog`/`DenyGrantDialog` (grants) and `ApproveAgentDialog`/`DenyAgentDialog` (agents) for inline actions.
- Uses `useAgents` / grant queries to resolve card context.
