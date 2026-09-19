# Organization member directory

The shared organization member directory resolves opaque historical user IDs into readable names without duplicating names into Audit or Vault history records.

## Contract

- `GET /api/organization/member-directory` returns only `{ userId, displayName }` for current and former members of the active organization.
- `shared/api/organization-member-directory-api.ts` consumes the trusted first-party TypeScript contract and projects only `userId` and `displayName`; it does not validate backend-owned presentation metadata at runtime.
- `useOrganizationMemberDirectory` owns one TanStack Query cache per `org_id`. Its five-minute stale time limits routine refetches, and the authenticated layout preloads it once the organization-scoped session exists.
- The cache is browser-memory-only. Session cleanup clears the QueryClient on logout, while the shared hook explicitly removes the previous directory query when `org_id` changes, so identities cannot cross tenant or session boundaries.
- Consumers pass the user IDs visible on the current surface as `requiredUserIds`. After a successful directory load, a missing required ID triggers one full-directory refetch per missing ID for that hook lifetime. This repairs stale caches after a membership change without creating per-row requests or an N+1 lookup path.
- If an ID is still absent, UI uses the shared prefix-and-suffix identifier shortening rule. It never renders a full identifier as the primary label.

The Team member query is a different contract. It returns active membership state, e-mail, roles and permissions for team-management surfaces; do not use it as the shared Audit or history resolver.

Vault history ciphertext remains unchanged. The member directory contains server-visible account metadata only and must never receive Entry labels, descriptions, types, fields, ciphertext, keys or decrypted values.
