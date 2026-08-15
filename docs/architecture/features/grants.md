# Feature: grants

**Path:** `src/features/grants/` — the highest cross-feature dependency in the app.

## What it does
The access-control surface: agents request access to vaults/entries, and admins approve or deny those requests. Approval is where the zero-knowledge crypto re-wrapping happens.

## How it's organized
Two split-view route pages — a per-vault grant master/detail view and an org-wide pending-approvals queue alongside an org grants panel. The approval dialog is the heaviest piece; a policy-fields component captures the time/IP/use-count/lifetime matrix (with a `DateTimePicker`); a grant-access dialog initiates requests from the vault side.

## Key patterns
- **Protocol 2 grant envelopes:** FULL and GRANULAR grants both receive per-Entry canonical payloads encrypted under a fresh GrantDEK. The GrantDEK is sealed to the Agent's current X25519 key; VK, VDK and EntryDEK are never granted. Every envelope is bound to the grant, Agent, Entry, exact Entry revision, member key generation and recipient key version. User-selected Methods are independent of Entry type and are authenticated unchanged in every envelope. `deliveryPolicy` defaults to `standard = 0`; `execOnly = 1` and `injectOnly = 2` are reserved for an explicit policy rather than inferred from encrypted Entry data.
- **Bounded FULL creation:** the client starts one server-fenced preparation that freezes the selected Methods, reads authoritative ciphertext material once in keyset pages of at most 100 Entries, opens and wraps one Entry at a time with that exact method mask, appends at most 100 envelopes, then commits once. The backend activates the FULL grant only when the exact active Entry/revision set is complete. Empty Vaults commit with zero envelopes so future Entry creation can add coverage atomically.
- **Field-policy enforcement:** the encrypted payload contains only fields whose policy permits the approved method. Discovery-only, member-only and `never` fields are excluded; TOTP source material is derived-only and Script source material is runtime-only. Refreshes may narrow the persisted field scope but never broaden it.
- **Atomic refresh:** Entry updates produce the next immutable projections and the exact refreshed envelope set for all active covering grants in one backend transaction. Missing, stale or over-broad envelope context fails closed and rolls the whole update back.
- **Access-reason history:** pending and historical Grant responses carry only the Agent-signed `EncryptedReasonEnvelope`. The unlocked client groups rows per Vault, verifies and decrypts reasons locally, and keeps plaintext only in TanStack Query's in-memory session cache. Lock removes that cache; cards never trust notification metadata or a server-provided plaintext reason.
- Split-view layout (2 pages).
- The policy fields hold an unexported select-class constant — a candidate for the shared `FormSelect`.

## Cross-feature deps
The org grants panel, grant-access dialog, and approve/deny dialogs are **exported and consumed by `vaults`** (entry/vault Agents tabs) and **`notifications`** (inline approve/deny). Approval and regrant always resolve the current Agent key metadata before producing envelopes; notification metadata is not trusted as cryptographic context. Changes here ripple into both.
