# Feature: teams

**Path:** `src/features/teams/`

## What it does

Shows the people in the active organization with their e-mail address, all dynamic roles, owner marker, and join date. Organization roles describe administrative permissions only - they never imply cryptographic access to a vault.

## How it is organized

- `api/team-members-api.ts` validates `GET /api/organization/members` with Zod and owns the member/role types.
- `use-team-members.ts` owns the TanStack Query. Its cache key includes the active `org_id` JWT claim so switching organizations cannot reuse another tenant's member list. The query stays disabled until that claim is available after session refresh.
- `team-members-page.tsx` owns loading, empty, error/retry, and list states.
- `components/team-member-card.tsx` renders every role returned by the API and treats `isOwner` as a separate membership property.

## Route and navigation

- Route: `/team`
- Navigation: `Team` / `Zespół`, visible to every authenticated organization member.

## Follow-up surfaces

Inviting a member and changing roles/removing a member are separate tasks. Keep those mutations in this feature and invalidate the organization-specific team members query after success.
