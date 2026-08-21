# Feature: settings

**Path:** `src/features/settings/`

## What it does
Organization and account settings under one route hierarchy.

## How it's organized
A route layout owns a responsive section rail. Organization settings (General, Team, Permissions, API Keys, Billing) start directly below the compact Settings header; the Account label separates Security and Data export. Child features render through the route `Outlet`; list/detail sections use `ResponsiveMasterDetail`, so wide screens show Settings rail + list + detail while narrower screens drill into the selected resource route.

## Key patterns
- Canonical routes live under `/settings/*`; `/settings` redirects to `/settings/general`.
- Legacy `/team`, `/api-keys`, `/api-keys/:keyId`, `/billing`, and `/security` routes redirect to their canonical Settings locations.
- The Settings rail hides API Keys without `ReadApiKey` and Permissions without `OrganizationManagement`; both route trees repeat those guards.
- General is readable to every member and editable only with `OrganizationManagement`.
- The Settings rail header follows the same one-line title/subtitle scale and height as Inbox, Agents, and Vaults, without an extra divider or a repeated active-section heading.
- The Settings rail owns a 72px header band. Team, Permissions and API Keys pair 16px panel padding with the shared 40px `SETTINGS_MASTER_HEADER_CLASSES` row and 16px following gap, so every master title/subtitle has the same top and baseline.
- Narrow master/detail routes place their navigation-only back button in `DetailTabBar.leading`. A lone back arrow must never consume a separate row above the tabs; headers that also carry an entity title remain a distinct header pattern.
- General, Security, Billing and Data export use `SettingsSectionPage` for a full-width, internally scrolling body. The component keeps the route title available to assistive technology without rendering a duplicate visual heading.

## Cross-feature deps
Reads `useAuthStore` for org context and permissions. Route-level composition hosts Teams, Permissions, API Keys, Billing, Auth Security, and Vault export surfaces without moving their domain logic into Settings.
