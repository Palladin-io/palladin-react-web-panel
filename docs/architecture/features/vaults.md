# Feature: vaults

**Path:** `src/features/vaults/` — the largest feature.

## What it does
Vault and entry management: the core of the product. Users browse vaults, drill into a vault, and open individual entries to reveal/edit decrypted credentials.

## How it's organized
Three nested levels, each a split-view page with its own tab strip:
- **Vault list** → list panel + create/settings flows.
- **Vault detail** — tabs: Entries / Agents / Audit / Members / Settings.
- **Entry detail** — tabs: Details / Agents / Logs.

Protocol 2 list/search data comes from `sync/`: after unlock, `MemberSyncProvider` opens the Member Vault key, builds an initial snapshot, applies the closing delta, and then follows incremental deltas. IndexedDB stores only authenticated ciphertext envelopes, structural metadata, and sequence cursors. Decrypted Vault metadata and normalized MemberIndex records live in Zustand memory and are cleared immediately on lock/logout. Entry secrets remain lazy and are never part of Member sync.

The Vault list and split-view list panel consume decrypted `MemberVaultMetadata` directly from the in-memory sync store and search names/descriptions locally. The Vault Detail Entries tab likewise projects Active, Archived and Recently Deleted rows from the in-memory `MemberIndex`, including local search/sort and isolated anonymous corruption rows; tombstones and optimistic revisions flow through the same sync store. These surfaces expose locked, syncing, reset and partial-error states without falling back to server-side content search. Remaining legacy entry-detail screens consume the exported detail query until their individual protocol 2 migration tasks land. Active entry rows and the entry-detail page own the decrypt-on-demand logic; create/edit flows follow the inline-edit and modal conventions.

The Vault Detail Agents tab keeps encrypted Discovery provisioning separate from secret authorization. It lists active organization Agents as `current` or `pending` against the Vault's VDK/manifest epoch, identifies them by server-resolved name with a shortened opaque ID fallback, and explains that deactivated Agents are excluded from future Discovery updates. Scoped grant history remains visible below, including expired and revoked grants. This protocol 2 surface suppresses the legacy regrant action because an Agent must never receive a VK or EntryDEK; revocation remains available.

The Vault Detail Members tab reads the structural Member directory in keyset pages of 50 (server maximum 100). It never treats organization membership as Vault membership. `Active`, `Pending`, `WaitingForRotation`, and `BlockedLastMember` are server-owned states; a removal request is never presented as completed before every affected Vault rotation commits. The current Vault stays usable during planned rotation. The organization-wide removal mutation is shared through `shared/api/organization-members-api.ts`, while the Vault feature owns only its tab hook and presentation. Success invalidates both the selected Vault directory and the organization-member cache prefix.

## Key patterns
- **Zero-knowledge on-demand:** the vault key is unsealed and the entry decrypted only at reveal/open time; plaintext lives in component `useState` and never leaves memory.
- **Bounded Member sync:** pages contain at most 200 items, responses fail above 4 MiB, projection work runs in chunks of 25 with at most four concurrent AEAD operations, and each chunk yields to the browser. The unlocked account index fails closed above 10,000 actual heads; it is never silently truncated.
- **Atomic completeness:** snapshot pages build a private cache namespace; the namespace becomes active only after its closing delta commits. Each active delta page and cursor update share one IndexedDB transaction. `resetRequired` discards the pending namespace and rebuilds without exposing a partial view.
- **Offline local search:** the unlocked, normalized MemberIndex supports local search across 10,000 entries. Optimistic projections reconcile by monotonic MemberIndex revision and never write plaintext to IndexedDB.
- **Freshness:** while an unlocked tab remains visible and online, a non-overlapping incremental delta poll runs every 60 seconds; online and visibility transitions trigger an immediate refresh.
- **Staged member removal:** a successful DELETE means requested, not removed. The Members tab polls structural status without key material, distinguishes active processing from paused/error state, and exposes the last-capable-Member blocker without disabling normal Vault use.
- **Atomic encrypted Vault creation:** a server-issued opaque ID scopes one client-generated VK, VDK and private-key set. The create request contains encrypted metadata and key envelopes only; the resulting Vault enters the UI through normal Member sync. Custom encrypted presentation assets are handled by their dedicated protocol-2 flow, not by legacy plaintext S3 icon upload.
- Split-view layout (3 pages) and an inline entry-detail tab strip — both candidates for the shared `SplitView` / `DetailTabBar` (see component-catalog).

## Cross-feature deps
- Imports `OrgGrantsPanel` and the grant dialogs from `grants` for the Agents tabs.
- Exports `useVaults` / `useVault` / `useEntries`, consumed by `audit`.
