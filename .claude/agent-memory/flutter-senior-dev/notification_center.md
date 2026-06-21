---
name: notification-center
description: Mobile Notification Center (CVT-165) — frozen contract shape, file layout, what reuses what
metadata:
  type: project
---

# Notification Center (mobile, CVT-165 / epic CVT-162)

Branch `feat/cvt-165-notification-center` (worktree `.worktrees/cvt-165-mobile`), PR #20 (draft, assignee don-flamingo).

**Frozen contract:** `docs/obsidian/claw-vault/Product/Modules/Notification/Notification Center (CVT-162).md`. Backend builds the same contract in parallel — do NOT invent fields.

**Contract data shape (authoritative):** `NotificationItem { id, type, category(ActionRequired|Update), titleKey, metadata(names+ids, NO secrets), occurredAt, readAt?, actionState(pending|resolved|null) }`. Summary = `{ unreadCount, pendingActionCount }`. Preferences = `PreferenceItem { type, category, inboxEnabled, signalREnabled, pushEnabled, mandatory }`. Push payload carries `notificationId` + `type`.

**Why it matters:** an earlier WIP used `title/body/topic/actionType/actionTarget` and segments To-do/Updates — that diverged from the frozen contract and had to be reworked to `titleKey + metadata + category + actionState`. If you touch this, match the contract, not the old shape.

**Lives under `lib/features/notifications/`** (NOT a new `notification_center/` dir). Key files: `domain/entities/inbox_notification.dart` + `notification_preference.dart`; `data/.../notification_center_*`; `presentation/cubit/notification_center_cubit.dart` (lazySingleton, drives badge) + `notification_preferences_cubit.dart` (factory, optimistic+rollback); `presentation/pages/notification_center_page.dart` + `notification_preferences_page.dart`; `presentation/widgets/notification_card.dart` + `notification_format.dart`.

**Reuse, don't rebuild:** grant approve/deny = existing `ApproveGrantSheet`/`DenyGrantSheet` → `GrantApprovalCubit` → `ApprovalRepository` (crypto unchanged); resolve the `PendingGrant` from `PendingGrantsCubit` (refresh first — inbox event can beat the singleton). `GrantDetailRow` is exported from `grants/.../org_grant_card.dart`; `grantRelativeTime` from `grants/.../grant_format.dart`.

**Decisions:** segments = To-do / **History** (task overrides contract's "Updates"). `credential_created` deferred (do NOT implement). Re-grant in History = navigation only for now (re-wrap crypto deferred). Inbox shown to everyone (GrantManage gate removed); actions stay gated. Deep-link `/inbox?focus={notificationId}` marks read on open. `/approvals` redirects to `/inbox`.

**Async-gap lint:** splitting an async refresh from the sync sheet-show (keep BuildContext use synchronous after a `if (!context.mounted) return;` guard) is what cleared `use_build_context_synchronously` here.

**Wire casing (review fix, 2026-06-16):** the inbox API serializes enum values **camelCase** — `category` is `actionRequired`/`update`, `actionState` is `pending`/`resolved`. `NotificationCategory.fromWire` must match `actionRequired` first (keep Pascal/snake fallbacks). Matching only `ActionRequired` sent everything to `update` → To-do empty, no approve/deny buttons. Push `data.type` stays **snake_case** (`grant_pending`, `grant_revoked`, `credential_stale`, `agent_pending`, `grant_approved`). `PushNotificationType` must include `grant_revoked` + `credential_stale`; both deep-link to `/inbox?focus={notificationId}`. `agentPublicKey` for approve/regrant comes from grant_pending `metadata` (backend adds it). `pending_grants_page.dart` was deleted — `/approvals` redirects to `/inbox`; `PendingGrantsCubit` stays only as approve/deny data-source.
