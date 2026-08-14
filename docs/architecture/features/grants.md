# Feature: grants

**Path:** `src/features/grants/` — the highest cross-feature dependency in the app.

## What it does
The access-control surface: agents request access to vaults/entries, and admins approve or deny those requests. Approval is where the zero-knowledge crypto re-wrapping happens.

## How it's organized
Two split-view route pages — a per-vault grant master/detail view and an org-wide pending-approvals queue alongside an org grants panel. The approval dialog is the heaviest piece; a policy-fields component captures the time/IP/use-count/lifetime matrix (with a `DateTimePicker`); a grant-access dialog initiates requests from the vault side.

## Key patterns
- **Protocol 2 grant envelopes:** FULL and GRANULAR grants both receive per-Entry canonical payloads encrypted under a fresh GrantDEK. The GrantDEK is sealed to the Agent's current X25519 key; VK, VDK and EntryDEK are never granted. Every envelope is bound to the grant, Agent, Entry, exact Entry revision, member key generation and recipient key version. Its authenticated `deliveryPolicy` is `standard = 0`, `execOnly = 1` or `injectOnly = 2`; Script always uses `execOnly`, while Credit Card always uses `injectOnly` and requires exactly the Inject method. Field names never act as the type discriminator.
- **Field-policy enforcement:** the encrypted payload contains only fields whose policy permits the approved method. Discovery-only, member-only and `never` fields are excluded; TOTP source material is derived-only and Script source material is runtime-only. Refreshes may narrow the persisted field scope but never broaden it.
- **Atomic refresh:** Entry updates produce the next immutable projections and the exact refreshed envelope set for all active covering grants in one backend transaction. Missing, stale or over-broad envelope context fails closed and rolls the whole update back.
- Split-view layout (2 pages).
- The policy fields hold an unexported select-class constant — a candidate for the shared `FormSelect`.

## Cross-feature deps
The org grants panel, grant-access dialog, and approve/deny dialogs are **exported and consumed by `vaults`** (entry/vault Agents tabs) and **`notifications`** (inline approve/deny). Approval and regrant always resolve the current Agent key metadata before producing envelopes; notification metadata is not trusted as cryptographic context. Changes here ripple into both.
