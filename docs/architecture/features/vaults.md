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

The Vault list and split-view list panel consume decrypted `MemberVaultMetadata` directly from the in-memory sync store and search names/descriptions locally. They expose locked, syncing, reset, partial-error and anonymous-corruption states without falling back to server-side name search. Remaining legacy entry/detail screens still consume the exported vault/entry queries (`useVault`, `useEntries`) until their individual protocol 2 migration tasks land. Entry rows and the entry-detail page own the decrypt-on-demand logic; create/edit flows follow the inline-edit and modal conventions.

## Key patterns
- **Zero-knowledge on-demand:** the vault key is unsealed and the entry decrypted only at reveal/open time; plaintext lives in component `useState` and never leaves memory.
- **Bounded Member sync:** pages contain at most 200 items, responses fail above 4 MiB, projection work runs in chunks of 25 with at most four concurrent AEAD operations, and each chunk yields to the browser. The unlocked account index fails closed above 10,000 actual heads; it is never silently truncated.
- **Atomic completeness:** snapshot pages build a private cache namespace; the namespace becomes active only after its closing delta commits. Each active delta page and cursor update share one IndexedDB transaction. `resetRequired` discards the pending namespace and rebuilds without exposing a partial view.
- **Offline local search:** the unlocked, normalized MemberIndex supports local search across 10,000 entries. Optimistic projections reconcile by monotonic MemberIndex revision and never write plaintext to IndexedDB.
- **Freshness:** while an unlocked tab remains visible and online, a non-overlapping incremental delta poll runs every 60 seconds; online and visibility transitions trigger an immediate refresh.
- **Two-step resource creation** for vault icons (create → receive ID → PATCH via S3 presign).
- Split-view layout (3 pages) and an inline entry-detail tab strip — both candidates for the shared `SplitView` / `DetailTabBar` (see component-catalog).

## Cross-feature deps
- Imports `OrgGrantsPanel` and the grant dialogs from `grants` for the Agents tabs.
- Exports `useVaults` / `useVault` / `useEntries`, consumed by `audit`.
