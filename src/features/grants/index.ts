export { GrantsPage } from './grants-page'
export { PendingGrantsPage } from './pending-grants-page'
export { OrgGrantsPanel } from './components/org-grants-panel'
export { PendingGrantsPanel } from './components/pending-grants-panel'
export { usePendingGrants } from './use-pending-grants'
export { GrantAccessDialog } from './components/grant-access-dialog'
export type { GrantAccessMode } from './components/grant-access-dialog'
// Promoted for the Notification Center (CVT-164) so the Inbox can drive the
// existing zero-knowledge approve/deny/revoke/regrant flows — crypto unchanged.
export { useApproveGrant } from './use-approve-grant'
export { useDenyGrant } from './use-deny-grant'
export { useRevokeOrgGrant } from './use-revoke-org-grant'
export { useRegrant } from './use-regrant'
export { ApproveGrantDialog } from './components/approve-grant-dialog'
export { DenyGrantDialog } from './components/deny-grant-dialog'
export { RevokeGrantDialog } from './components/revoke-grant-dialog'
export { GrantAgainDialog } from './components/grant-again-dialog'
export type { GrantPolicyBody } from './grant-policy'
export type { GrantMethod } from './grant-methods'
export {
  GRANTS_QUERY_KEY,
  PENDING_GRANTS_QUERY_KEY,
  vaultGrantsQueryKey,
  grantDetailQueryKey,
} from './query-keys'
export type { Grant, GrantStatus, GrantMode } from './api/grants-api'
export type { PendingGrant } from './api/pending-grants-api'
// Promoted for the Notification Center (CVT-164): the Inbox shares the grant
// date/relative-time formatters and the org-grant type + granular discriminant.
export { formatGrantDate, formatRelativeTime } from './components/grant-format'
export type { OrgGrant } from './api/org-grants-api'
export { GRANT_TYPE_GRANULAR, GRANT_STATUS_ACTIVE } from './api/org-grants-api'
// Promoted for the Entry Detail · Agents tab (CVT-127): the header needs the
// active-agent count, computed from the same (deduped) org-grants query the
// embedded panel already runs.
export { useOrgGrants } from './use-org-grants'
// Promoted for the dashboard status tiles (CVT-186): grant counts per status.
export { useGrantSummary } from './use-grant-summary'
export type { GrantSummary } from './api/grant-summary-api'
// Promoted for the dashboard "Recently added / modified" widget (CVT-189):
// reuses the cross-vault entry-search client with `sort=recent`.
export { useRecentEntries } from './use-recent-entries'
export type { EntrySearchItem } from './api/entry-search-api'
