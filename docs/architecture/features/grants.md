# Feature: grants

**Path:** `src/features/grants/` — the highest cross-feature dependency in the app.

## What it does
The access-control surface: agents request access to vaults/entries, and admins approve or deny those requests. Approval is where the zero-knowledge crypto re-wrapping happens.

## How it's organized
Two split-view route pages — a per-vault grant master/detail view and an org-wide pending-approvals queue alongside an org grants panel. The approval dialog is the heaviest piece; a policy-fields component captures the time/IP/use-count/lifetime matrix (with a `DateTimePicker`); a grant-access dialog initiates requests from the vault side.

## Key patterns
- **Disjoint Protocol 2 grant material:** GRANULAR receives one per-Entry canonical payload encrypted under a fresh GrantDEK, with that GrantDEK sealed to the Agent's current X25519 key. FULL receives one `AgentWrappedVaultKey`: the complete current 32-byte VK sealed to that exact Agent. The FULL descriptor binds the Organization, Vault, Grant, Agent, access epoch, recipient key version and fingerprint, VK version, suite and purpose. The server stores ciphertext only; plaintext VK is opened only inside the native Agent runtime and never crosses into Node, MCP or the browser extension.
- **O(1) FULL creation:** after resolving the authoritative Agent key and access epoch, the unlocked client seals the current VK once and submits one direct grant request. Vault size and future Entry changes do not create additional FULL-grant material.
- **Field-policy enforcement:** the encrypted payload contains only fields whose policy permits the approved method. Discovery-only, member-only and `never` fields are excluded; TOTP source material is derived-only and Script source material is runtime-only. Refreshes may narrow the persisted field scope but never broaden it.
- **Atomic GRANULAR refresh:** Entry updates produce the next immutable projections and the exact refreshed envelope set for active GRANULAR grants on that Entry in one backend transaction. FULL grants require no per-Entry refresh. Missing, stale or over-broad GRANULAR context fails closed and rolls the whole update back.
- **Access-reason history:** pending and historical Grant responses carry only the Agent-signed `EncryptedReasonEnvelope`. The unlocked client groups rows per Vault, verifies and decrypts reasons locally, and keeps plaintext only in TanStack Query's in-memory session cache. Lock removes that cache; cards never trust notification metadata or a server-provided plaintext reason.
- Split-view layout (2 pages).
- The policy fields hold an unexported select-class constant — a candidate for the shared `FormSelect`.

## Cross-feature deps
The org grants panel, grant-access dialog, and approve/deny dialogs are **exported and consumed by `vaults`** (entry/vault Agents tabs) and **`notifications`** (inline approve/deny). Approval and regrant always resolve the current Agent key metadata before producing envelopes; notification metadata is not trusted as cryptographic context. Changes here ripple into both.
