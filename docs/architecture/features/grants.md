# Feature: grants

**Path:** `src/features/grants/` — the highest cross-feature dependency in the app.

## What it does
The access-control surface: agents request access to vaults/entries, and admins approve or deny those requests. Approval is where the zero-knowledge crypto re-wrapping happens.

## How it's organized
Two split-view route pages — a per-vault grant master/detail view and an org-wide pending-approvals queue alongside an org grants panel. The approval dialog is the heaviest piece; a policy-fields component captures the time/IP/use-count/lifetime matrix (with a `DateTimePicker`); a grant-access dialog initiates requests from the vault side.

## Key patterns
- **Disjoint Protocol 2 grant material:** GRANULAR receives one per-Entry canonical payload encrypted under a fresh GrantDEK, with that GrantDEK sealed to the Agent's current X25519 key. FULL receives one `AgentWrappedVaultKey`: the complete current 32-byte VK sealed to that exact Agent. The FULL descriptor binds the Organization, Vault, Grant, Agent, access epoch, recipient key version and fingerprint, VK version, suite and purpose. The server stores ciphertext only; plaintext VK is opened only inside the native Agent runtime and never crosses into Node, MCP or the browser extension.
- **O(1) FULL creation:** after resolving the authoritative Agent key and access epoch, the unlocked client seals the current VK once and submits one direct grant request. Vault size and future Entry changes do not create additional FULL-grant material.
- **Authoritative grant discriminator:** every management DTO contains the backend's explicit `type` (`full`, `granular` or `scriptExecution`). Zod rejects a missing or unknown discriminator; the client never reconstructs it from nullable fields, payload shape, endpoint or persistence behavior.
- **Field-policy enforcement:** the encrypted payload contains only fields whose policy permits the approved method. Discovery-only, member-only and `never` fields are excluded; TOTP source material is derived-only and Script source material is runtime-only. New granular grants default to `fieldSelectionMode: all`; the owner can choose `selected` in create/approval. All refreshes project the current grantable fields, including later additions. Selected refreshes intersect the retained `selectedFieldIds` with current policy; missing mode preserves the previous field list. Re-grant retains the previous selection. Methods, expiry and remaining uses are unchanged.
- **Atomic GRANULAR refresh:** Entry updates produce the next immutable projections and the exact refreshed envelope set for active GRANULAR grants on that Entry in one backend transaction. FULL grants require no per-Entry refresh. Missing, stale or over-broad GRANULAR context fails closed and rolls the whole update back.
- **One ScriptExecution grant:** direct access to a Script creates one durable grant with `Exec` only and one complete opaque package containing the Script manifest plus all referenced current MemberSecrets. References never become independent grants. Editing the Script or any referenced Entry refreshes every affected package atomically under the same `grantId` and the next `packageRevision`; lifecycle policy and query count are preserved. A covering FULL grant remains sufficient without per-Script material.
- **Member-visible Script scope:** before a direct Script grant is submitted or reissued, the browser opens the Script locally and shows its description, parameter count, reference count, result-return policy and value-free reference coordinates (`env`, shortened `entryId` and exact `fieldId`). Failure to decrypt the current contract blocks the grant, and the reviewed Script revision must still match while the package is built. Script source and resolved secret values are never rendered or sent as plaintext.
- **Access-reason history:** pending and historical Grant responses carry only the Agent-signed `EncryptedReasonEnvelope`. The unlocked client groups rows per Vault, verifies and decrypts reasons locally, and keeps plaintext only in TanStack Query's in-memory session cache. Lock removes that cache; cards never trust notification metadata or a server-provided plaintext reason.
- **Server-authoritative history footers:** cards render `canRevoke`, `canGrantAgain` and `activeCoveringGrantIds` without reconstructing coverage in the browser. Active grants offer revoke; terminal expired/consumed/denied/revoked grants offer Grant again when allowed. If a newer active Grant covers the same access, the footer explains that state and links to its detail/revoke flow. Otherwise it links to the related Agent or Vault for unavailable targets.
- **Shared re-grant path:** re-grant delegates to the same type-specific client-side creation operation as proactive access. GRANULAR posts one revision-bound envelope to the Entry endpoint, FULL posts one signed `AgentWrappedVaultKey` to the FULL endpoint, and ScriptExecution posts one complete package to the Script endpoint.
- Split-view layout (2 pages).
- The policy fields hold an unexported select-class constant — a candidate for the shared `FormSelect`.

## Cross-feature deps

CVT-573: Grant construction and grantable-field presentation now delegate to
`@palladin/crypto` 0.6.0's current delivery-bound builder. Plaintext and complete
ScriptExecution package producers are thin adapters to the shared current
contract, including exact Discovery references, derived TOTP and Key URL content.
No local grant or Script package crypto producer remains. The manifest and
lockfile pin the published registry release 0.6.0; clean installs do not depend
on a local tarball or a feature-branch package.

The org grants panel, grant-access dialog, and approve/deny dialogs are **exported and consumed by `vaults`** (entry/vault Agents tabs) and **`notifications`** (inline approve/deny). Approval and regrant always resolve the current Agent key metadata before producing envelopes; notification metadata is not trusted as cryptographic context. Changes here ripple into both.
