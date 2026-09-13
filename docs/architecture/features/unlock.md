# Feature: unlock

**Path:** `src/features/unlock/`

## What it does
The lock screen — the sole reachable route while `isVaultLocked === true`. Identity password KDF v1 takes the master password, re-derives MK, and decrypts the member private key back into memory.

## How it's organized
One theme-aware page with a password field. The unlock hook validates the authenticated KDF state, derives via the registered password-only profile, decrypts the stored private key, and writes independent key copies into Zustand. Unsupported profiles fail closed.

## Key patterns
- **Session ceilings:** `unlockVault` records original memory-only unlock deadlines and accepts verified inherited limits capped by Web policy. Expired limits cannot publish keys, and layout remount/refresh does not renew them.
- **Non-persisted lock state:** `isVaultLocked` is never persisted; it starts `true` on every load. Manual unlock and the verified shared-unlock installation can flip it to `false`. This is the security-critical routing primitive.
- **Brand header:** shared `AuthBrandHeader` matches the landing hero proportions and spacing, followed by the master-password instruction. The functional unlock title stays available to screen readers.
- **Auth-surface page:** `.auth-surface` follows the persisted app theme; `FormInput`, `FieldFeedback`, `AuthSubmitButton`.
- **Deep-link return:** the authenticated guard and session timeout forward the requested internal URL through `/unlock?redirect=…`; both normal unlock and onboarding return to it after keys are restored in memory. Unsafe or looping redirect values fall back to `/`.

## Cross-feature deps
Reads/writes `useAuthStore` (`isVaultLocked`, key setters). All route guards depend on this flag.

Password unlock also prepares fresh own shared-unlock authority through the auth
module. If an OAuth-only account enables password login during unlock, it reloads
Identity's current revisions after setup before preparing that authority. Local
keys remain usable if sharing fails. Client/crypto session generations and the
current manual attempt reject delayed work after lock/logout/expiry, unmount or
a newer attempt. The live authenticated-session boundary now unmounts protected
content on local/peer lock or logout and routes to unlock/login with the original
internal destination. A sidebar Lock action retains the own login and records
manual shared closing; generic lock does not echo it. Restarted/rootless closing
repair, remaining shared unlock fallback UX and native end-to-end acceptance remain open.

The completed automatic Web receiver emits the localized Sonner message
“Panel unlocked by the Palladin extension.” once, after installing its own verified
session and checking that it has not been superseded. The existing root Toaster
announces politely without moving focus. No account/operation identifiers enter
the message. Manual unlock, state restoration, remount and ACK do not trigger it;
cancelled or rejected receiver attempts never reach the notification. A lost ACK
does not suppress a completed own operation or create another notification.

A retired own authorization is a local admission denial. The browser coordinator
cancels that exact handoff while keeping the verified channel, so reconnect does
not repeatedly consume/commit/revoke the same expired authority and exhaust the
server's operation limiter. Ordinary activity notifications do not restart a
completed denied attempt. A new manual source generation may negotiate a fresh
attempt, still subject to the same own expiry checks. Other receiver failures
continue to close the channel; this exception grants no keys or session rights.

If Identity issued a receiver session that fails local installation, cleanup
authenticates `/api/auth/logout` with that issued session's own access token and
revokes its matching refresh-token lineage. It uses the captured original API,
never the peer or current session's tokens. Cleanup remains best effort with a
two-second bound; local key wiping does not depend on the network result.


### Shared handoff after worker loss while Web is hidden

A live Web document reconnects its verified browser channel after worker loss even
when another tab is selected. The existing bounded retry backoff remains; hidden
visibility alone does not retire a valid own session. Pagehide/BFCache,
prerendering, changed origin and teardown still prevent connection and retire the
old route. Reconnecting neither counts as user activity nor renews an unlock
limit. The ordinary Identity/crypto/expiry gates still authorize every handoff.
