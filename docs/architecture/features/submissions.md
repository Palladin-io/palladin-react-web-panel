# Feature: submissions

**Path:** `src/features/submissions/`

## What it does
Lets a member with `GrantManage` review secrets that an Agent proposed through
the Agent Submission contract (`palladin-protocol` `contracts/agent-submission/v1`):
a new Entry or a new password/value for an Entry the Agent is granted. The
backend stores only signed ciphertext; the browser verifies and decrypts locally.

## How it's organized
- `/submissions` and `/submissions/:submissionId` use `ResponsiveMasterDetail`:
  the left panel lists Pending or Trash (`?view=trashed`), the right panel is
  the decision view or the trash restore card. The routes redirect members
  without `GrantManage` to the Inbox; the backend stays authoritative.
- The Inbox renders `submission_pending` as an action card with **Review** and
  shows a **Submissions** link with the pending count. Notification metadata
  carries only the opaque `submissionId`; Agent name, kind and Entry type are
  resolved from the authorized submissions list. Toasts and Web Push open the
  decision view; the service worker builds that path locally from an
  allow-listed type and a UUID subject.
- `ApproverKeyReconciler` (mounted in the authenticated shell) maintains the
  organization approver key set without clicks: bootstrap when absent, wrap the
  current keys for new approvers, rotate after a removed approver or a changed
  Member key. Compare-and-swap losers refetch and re-evaluate; each observed
  state is attempted at most three times per unlock session. Re-bootstrap of an
  `unavailable` set is always explicit (Settings → Security or the decision
  view) behind a `WarningZone`, because Agents must re-trust the new key.

## Key patterns
- **Crypto stays in `shared/crypto/agent-submission.ts`.** Approver private keys
  are opened from the caller's own wraps only for one operation and wiped in
  `finally`; they are never stored in Zustand or any query. Decrypted payloads
  live only in a `gcTime: 0` query keyed by the unlock generation and are removed
  on lock.
- **Independent authorities:** own wraps are checked against the JWT
  organization, the authenticated principal, Identity's current Member key
  version and the fingerprint derived from the in-memory Member private key; the
  opened keys must reproduce the self-signed manifest. A submission is verified
  with the Agent directory Ed25519 key, the listed Agent ID and the caller's own
  approver key version/fingerprint before its DEK is opened. The signed
  `submissionId` must equal the id the client requested.
- **Agent strings are stored byte-for-byte.** Every payload string must be
  well-formed Unicode and already NFC; anything else is rejected as
  `invalid-field` when the submission is opened, before display, because Vault
  protocol 2 rejects non-NFC Entry strings and nobody may normalize a secret. Only
  a label typed by the approver is normalized. The approval builders keep a
  `secret-not-nfc` guard with a UI message as defense in depth.
- **Approval reuses Entry producers:** a new Entry uses the creation challenge and
  the shared-copy sealer `sealEntryShareCopy`, which binds the Vault response to the
  selected Vault, the JWT organization, current key coordinates and the Member
  wrapper of this principal before any key is opened; the Entry gets the canonical
  default Agent Visibility Policy. An update first requires the Entry detail and
  Vault response to match the signed target and the JWT organization, opens VK
  through the Member-bound Vault projection and reuses that same Vault response. An
  update decrypts the exact `expectedEntryRevision`, merges only the proposed
  fields (custom fields, TOTP and existing policy stay untouched; a newly present Key URL gets the schema-required policy entry `never`, so it is never granted) and calls
  `prepareCanonicalEntryUpdate`, so active GRANULAR and Script grants are
  refreshed exactly like a normal edit. A moved target is a stale conflict: the
  approver may save the proposal as a new Entry or deny it.
- **Default Agent access** needs a successful Agent lookup; while it loads or after
  a failure (retryable), Approve stays disabled instead of approving without it.
  Otherwise it is one GRANULAR grant for that Entry with `inject`
  only, no expiry and no use limit. It is omitted when the approver turns it off,
  when the Agent is inactive, or when an active FULL grant or an Entry grant
  already covers the target (the existing access is shown instead).
- `submission_pending` and `submission_resolved` realtime/push events invalidate
  the submission lists through the shared notification invalidation hook.
- Deny moves to the 30-day trash; restore returns the submission to pending.
  No `fe:` success analytics are emitted; the backend owns decision outcomes.

## Cross-feature deps
Uses `vaults` (creation challenge, canonical Entry detail, Member sync store,
`prepareCanonicalEntryUpdate`), `grants` (methods, active grant lookup),
`agents` (`getAgent`, `AgentAvatar`) and `notifications` (feed invalidation).
`notifications` imports the submissions barrel for the Inbox card and link;
Settings → Security composes `ApproverKeySection` through the route.
