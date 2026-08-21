# Feature: teams

**Path:** `src/features/teams/`

## What it does

Shows the people in the active organization with their e-mail address, role count, owner marker, and join date. Organization roles describe administrative permissions only - they never imply cryptographic access to a vault.

## How it is organized

- `shared/api/organization-members-api.ts` validates `GET /api/organization/members` and the complete role-replacement response with Zod. Team keeps a compatibility re-export while Permissions reuses the same tenant member contract for its `Members (N)` role tab.
- `use-team-members.ts` owns the TanStack Query. Its cache key uses the shared `ORGANIZATION_MEMBERS_QUERY_KEY` prefix and includes the active `org_id` JWT claim so switching organizations cannot reuse another tenant's member list. The query stays disabled until that claim is available after session refresh.
- `team-members-page.tsx` owns loading, empty, error/retry, selection, and responsive master/detail composition.
- The Team master is one alphabetical stream of members and tenant-scoped pending invitations, with the shared `SearchBar` and a multi-select status filter (`Members`, `Pending invitations`). Do not restore separate Members/Invitations sections. Search covers member identity, e-mail and roles plus invitation e-mail and initial role.
- Managers with `AddUser` see pending invitations in that combined stream. Each row exposes the e-mail, initial role, a calendar-marked sent date, relative expiry in days/hours, and an explicit confirmation flow for cancellation. The `Pending` badge sits in the same identity-row slot and uses the same `METADATA_BADGE_CLASSES` geometry as the Owner badge, with the distinct semantic info-blue tone. The inline cancel action is compact enough to retain the same footer height as member and API-key cards.
- The invitation detail route uses `General` and `Roles` tabs. General contains exact sent/expiry timestamps, inviter display name, cancellation and a resend action. Resend follows the server-provided cooldown, rotates the single-use token, invalidates the previous link and renews the TTL without consuming another seat; success refreshes the list/detail timestamps. Roles edits the single invitation-safe role applied when the current link is accepted. The server revalidates pending state, tenant, active caller, `AddUser`, verified e-mail, delegation ceiling, system-role policy and the fail-closed `GrantManage` boundary for every mutation.
- Authoritative seat usage from tenant-scoped `GET /api/org` is shown as one compact capacity row inside the Invite dialog, at the decision point where it is needed: used/limit, remaining capacity, a semantic progress indicator, and a small `Manage seats` hand-off to `/settings/billing`. `seatUsage` includes members and live pending invitations; the client never infers entitlement from the rendered list. Billing is still a placeholder, so CVT-509 must replace that route hand-off with the paid seat-quantity flow before monetization launches. Cancelling invalidates the link, releases its reserved seat and refreshes both the invitation queue and organization usage query.
- `components/team-member-card.tsx` stays compact even when a member has many roles: its main row contains identity and the owner badge, while the shared card-footer strip contains join date and localized role count instead of an unbounded list of tags.
- `components/team-member-detail.tsx` uses General, Roles, and Audit log tabs. General shows stable membership metadata; Roles replaces a non-owner member's complete role-id set; Audit log is scoped to the selected member and keeps a client-side exact-user fence in addition to the server filter.
- `components/invite-member-dialog.tsx` uses a recipient-chip input: Enter, comma or semicolon commits a typed address; pasting a whitespace/comma/semicolon-separated list creates multiple chips; Backspace and each chip's remove button delete recipients. It accepts up to 25 addresses, normalizes and de-duplicates them, then sends the existing invitation command once per recipient with one backend-provided invitation-safe role. Processing is intentionally sequential; partial success leaves only failed recipient chips for correction or retry. The action is visible only with `AddUser`; the server still revalidates each recipient, role, delegation ceiling, verified e-mail, seat limit, and the fail-closed `GrantManage` boundary.
- The role catalog is shared through `shared/api/organization-roles-api.ts`; member and role queries remain tenant-scoped by the active `org_id`.
- The protected role-catalog query runs only for users with `OrganizationManagement`; read-only members see the roles already attached to the selected member without calling the management endpoint.
- Caller-aware `canAssign` prevents adding or removing roles above the manager's delegated authority while keeping already assigned roles visible. If the target member's effective permissions exceed the caller's permissions, the complete role editor is read-only to prevent demoting a higher peer.

## Route and navigation

- Routes: `/settings/team`, `/settings/team/:memberId`, `/settings/team/invitations/:invitationId`, and the email deep link `/invitations/accept?token=…`.
- Legacy `/team` redirects to `/settings/team`.
- Invitation acceptance is an authenticated, verified-email standalone surface. Opening the link never consumes its single-use token; only the explicit `Accept invitation` action does. A successful response replaces the session with the backend-issued session scoped to the joined organization, immediately locks and wipes the previous organization's in-memory keys, then sends the user through Unlock before any joined-organization data is rendered.
- The member list is visible to every authenticated organization member. Editing requires `OrganizationManagement`; the owner is always read-only.
- Inviting requires `AddUser`. Fresh organizations receive the invitation-safe system role `User` (`VaultCreate | VaultManage`), subject to the caller's delegation ceiling. Administrator and every role containing `GrantManage` remain intentionally excluded from invitations.
- Listing, resending, changing the pending invitation role and cancelling invitations require `AddUser` plus a verified e-mail. The backend scopes invitation IDs to the active organization and retains a cancellation marker for history instead of deleting the row.

## Follow-up surfaces

Removing an organization member remains a separate task. Organization-wide staged removal can also be initiated from a Vault's Members tab, so its minimal API mutation and cache prefix live in `shared/api/organization-members-api.ts`. A successful request invalidates the organization-member prefix, but the person remains effective and may remain listed until every affected Vault rotation commits.
