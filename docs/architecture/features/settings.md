# Feature: settings

**Path:** `src/features/settings/`

## What it does
Account/org settings. Currently scoped to org-level settings (org name); the home for future account, export, and deletion controls.

## How it's organized
A single page hosting an inline-edit org settings form (`canEdit`-gated, same dirty/disabled rules as other detail forms). No tabs, no audit, no split-view.

## Key patterns
- **Intentionally centered** (`mx-auto max-w-[820px]`) — the one approved exception to the left-aligned view-layout rule, appropriate for a settings page.

## Cross-feature deps
Reads `useAuthStore` for org context and permissions.
