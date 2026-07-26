# Feature: teams

**Path:** `src/features/teams/`

## What it does

Shows the people in the active organization with their e-mail address, all dynamic roles, owner marker, and join date. Organization roles describe administrative permissions only - they never imply cryptographic access to a vault.

## How it is organized

- `api/team-members-api.ts` validates `GET /api/organization/members` with Zod and owns the member/role types.
- `use-team-members.ts` owns the TanStack Query. Its cache key uses the shared `ORGANIZATION_MEMBERS_QUERY_KEY` prefix and includes the active `org_id` JWT claim so switching organizations cannot reuse another tenant's member list. The query stays disabled until that claim is available after session refresh.
- `team-members-page.tsx` owns loading, empty, error/retry, and list states.
- `components/team-member-card.tsx` renders every role returned by the API and treats `isOwner` as a separate membership property.

## Route and navigation

- Route: `/team`
- Navigation: `Team` / `Zespół`, visible to every authenticated organization member.

## Follow-up surfaces

Inviting a member and changing roles remain separate tasks. Organization-wide staged removal can also be initiated from a Vault's Members tab, so its minimal API mutation and cache prefix live in `shared/api/organization-members-api.ts`. A successful request invalidates the organization-member prefix, but the person remains effective and may remain listed until every affected Vault rotation commits.
