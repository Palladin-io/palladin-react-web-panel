# Feature: settings

**Path:** `src/features/settings/`

## What it does
Account/org settings. Single view; currently holds org-level settings only (org name edit).

## Key components / hooks / queries
- `settings-page.tsx` — page shell.
- `OrgSettingsForm` — org name edit (inline-edit pattern, `canEdit`-gated).

## Patterns
- **Intentionally centered** (`mx-auto max-w-[820px]`) — the one approved exception to the left-aligned view-layout rule, appropriate for a settings page. No tabs, no audit.

## Cross-feature deps
- `useAuthStore` for org context / permissions.
