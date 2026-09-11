# Security: CSP, headers & token storage

This doc is the deep reference for the web panel's browser-side security posture.
Quick rules live in `AGENTS.md` under **Security**; the details are here.

## Content-Security-Policy & security headers

The CSP is delivered as **HTTP response headers** from the `public/_headers`
template (Cloudflare Pages / Netlify `_headers` format). During a production
build, Vite replaces the public-asset placeholder with the validated origin of
`VITE_PUBLIC_ASSET_URL` and the connection placeholder with the exact origins of
`VITE_API_URL` and `VITE_SIGNALR_HUB_URL` (HTTP negotiation plus the corresponding
WebSocket origin). API origins are not shared implicitly across environments.
HTTPS is required except for explicit loopback HTTP; credentials, query strings,
fragments, whitespace and wildcard hosts are rejected. Missing build configuration
does not grant a default API origin. The completed file ships in `dist/` but is **not** enforced by Vite
or by a `<meta>` tag — it only takes effect when a host that understands
`_headers` serves the site.

### ⚠️ Keep it in sync

`_headers` is the single source of truth for which external origins the app may
talk to. The moment a code change starts loading from / connecting to a **new**
origin (analytics host, OAuth provider, CDN, WebSocket endpoint, font source,
image host…), the matching CSP directive MUST be updated in the same PR — or the
browser silently blocks the request in staging/prod (it works locally under
`vite dev`, which serves no CSP, so the breakage only shows up after deploy).

PR reviewers: treat a new external origin without a matching `_headers` update as
a blocking finding.

### Why each directive is what it is

| Directive | Value | Reason |
|-----------|-------|--------|
| `default-src` | `'self'` | Deny-by-default baseline. |
| `script-src` | `'self' 'wasm-unsafe-eval' https://accounts.google.com https://*.gstatic.com` | App bundle + `/init-theme.js` are self; Google Identity script; Firebase compat scripts the SW `importScripts` from gstatic. The narrow `wasm-unsafe-eval` source permits bundled libsodium/hash WASM compilation without enabling general JavaScript `unsafe-eval`; `unsafe-inline` and `unsafe-eval` remain forbidden. |
| `connect-src` | `'self'` + API hosts + `accounts.google.com` + `*.posthog.com` + `*.googleapis.com` + `www.gstatic.com` + `*.s3.eu-west-1.amazonaws.com` + `wss:` | XHR/fetch to the API, PostHog, FCM registration (`*.googleapis.com`), the SRI `fetch()` of the Firebase scripts (`www.gstatic.com`), the presigned `PUT` icon uploads to S3 (`*.s3.eu-west-1.amazonaws.com` — bucket in `eu-west-1`, name injected server-side so wildcarded; tighten to the exact bucket once known), and SignalR WebSocket (`wss:`). |
| `frame-src` | `https://accounts.google.com` | Google sign-in iframe/popup. |
| `img-src` | `'self' data: blob: {VITE_PUBLIC_ASSET_URL origin}` | Direct catalog icons from the configured and build-validated delivery origin, inline data URIs, and `blob:` local encrypted-icon previews. Arbitrary HTTPS image origins remain blocked. |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | Tailwind + our pervasive inline `style={{}}` attributes need `unsafe-inline`; Google Fonts stylesheet. |
| `font-src` | `'self' data: https://fonts.gstatic.com` | Self-hosted and data-URI compatibility fonts plus the Inter text font from Google Fonts; icons are bundled SVGs. |
| `worker-src` | `'self'` | The FCM service worker. |
| `frame-ancestors` | `'none'` | Clickjacking protection (paired with `X-Frame-Options: DENY`). |
| `object-src` | `'none'` | No plugins. |
| `base-uri` | `'self'` | Block `<base>` hijacking. |
| `form-action` | `'self'` | Forms can only submit to our own origin. |

Companion headers in the same file: `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Strict-Transport-Security` (2-year, `includeSubDomains; preload`),
`Permissions-Policy` (geolocation/mic/camera off).

## Analytics data minimization

PostHog receives only explicit, value-free UI events. Autocapture, session recording,
automatic page views/page leaves and client-side feature-flag requests are disabled.
The SDK does not save campaign or referrer parameters, and `before_send` removes current,
initial and session-entry URL/host/path/referrer properties (including nested `$set` and
`$set_once` values) from every manual event. This prevents login redirects and opaque,
one-time browser-pairing handles from reaching telemetry. Feature code must never attach
those handles, user-entered metadata, setup descriptors, secrets or credential values as
custom analytics properties.

## Subresource Integrity (SRI)

The only externally-executed scripts are the two Firebase compat bundles the
service worker loads. `importScripts()` has no `integrity` option, so
`public/firebase-messaging-sw.js` first does `fetch(url, { integrity })` (the
Fetch spec enforces SHA-384 SRI and rejects a tampered response) and only then
`importScripts` the already-validated URL. Bumping the Firebase version means
recomputing both pinned hashes — the command is in the SW file's comment.

libsodium WASM and all other JS are bundled by Vite from local `node_modules`,
so they are covered by the supply-chain review of `package-lock.json` + the CI
`npm audit --audit-level=high` gate, not by runtime SRI.

## Token storage

- **Access token — in memory only.** Never persisted. On reload it is `null` and
  the ky client silently re-mints it from the refresh token on the first 401.
- **Refresh token — persisted** (localStorage, `palladin-auth`). Needed to
  restore a session across reloads without forcing an OAuth round-trip.
- **Crypto keys (MK / privateKey / VK) — never persisted.** Closing the tab or a
  session timeout destroys them; the vault must be re-unlocked.
- **Current Entry ciphertext cache — IndexedDB only.** The cache may contain
  authenticated current MemberIndex/MemberSecret/EntryKey ciphertext, encrypted
  Member key wrappers, structural heads/cursors and a finite offline-access
  context. It never contains MK, the Member private key, raw VK/EntryDEK,
  decrypted MemberIndex, Entry plaintext or a TOTP seed. Lock may retain an
  unexpired generation; lease expiry, access denial and logout delete it.
- **Session timeouts:** `useSessionTimeout` (mounted in the authenticated
  layout) locks the vault and drops the access token after 15 min idle or 8 h
  absolute, then routes to `/unlock`.
- **SignalR diagnostics:** the SDK logger is disabled because WebSocket
  transport URLs carry `access_token` in the query string. The application
  logger emits lifecycle-only diagnostics and defensively redacts query-token
  values and JWT-shaped strings before writing to the development console.

### Follow-up (backend-coordinated, out of scope here)

Move the refresh token into an `httpOnly; Secure; SameSite` cookie so it is not
readable from JS at all. That requires the API to set/read the cookie and a CSRF
scheme on state-changing requests, so it is tracked as a backend task.

## Shared-unlock native browser channel (in progress)

The explicitly configured Chromium channel uses browser-native `runtime.connect`
to the deployment's exact extension ID. It loads no extension resource and opens
no iframe or HTTP/WebSocket endpoint. An actual built Web/Extension test passed
with the Web build's delivered CSP headers.

Firefox has a separate adapter. `VITE_SHARED_UNLOCK_FIREFOX_EXTENSION_ID` selects
the expected Gecko ID and enables `moz-extension:` only in `connect-src` and
`frame-src`; blank configuration disables both. A content-script message provides
only a candidate browser origin. Web constructs the fixed `/manifest.json` URL,
fetches it without credentials/cache/redirects, bounds the read to 64 KiB and two
seconds, and checks its canonical Gecko ID against deployment configuration.
The browser's exact iframe `MessageEvent.origin` and `source` bind messages;
payload IDs and paths cannot establish authority. Every inbound frame and the
coordinator's sensitive asynchronous boundaries recheck the canonical resource.
Iframe load/reload, removal, src mutation, `pagehide`, resource loss and Port loss
retire the route. The extension independently validates its own runtime sender,
top Web document, bridge document and browser-authored direct-parent binding.
No keys or plaintext Identity tokens live in the frame. Same-ID package replacement
remains the accepted compromised-client case, without store/profile attestation.

On 2026-09-11, the actual built Web/Extension channel and bridge-loss reconnect
passed on Firefox 155.0.1/macOS arm64 with delivered Web CSP. The later native
Identity harness passed 16 real registration/login/Entry-password/lifecycle checks
on that version, including Web close/reopen and controlled background restart.
This remains partial evidence; full OS/distribution coverage is a release gate.
Mozilla's [compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/webNavigation.json)
places the required `getAllFrames` document/parent-document IDs at Firefox 153.
The existing extension floor is 140. The extension now implements a separate
140–152 path gated by its browser-owned getBrowserInfo result. It compares a
private boot marker from the own bridge Port against a fresh browser-addressed
current-frame response, plus an independently read isolated top-document marker.
These markers never enter Web messages or public documentBinding. Top pagehide
invalidates its marker; restoration creates a new one. Navigation, Port loss and
expired browser reads retire pending/ready routes. Firefox153+ cannot fall back
to markers when native document authority is missing.

The first real140 run passes Identity login/unlock and Entry list update but
fails actual password autofill: that existing path independently requires native
sender.documentId. Full140 Entry-password/lifecycle acceptance and review remain
open; marker unit tests or MemberIndex display do not replace those proofs.
Safari still requires a separate adapter and browser-boundary assessment.

The provider retires the Web document on `pagehide`, including BFCache entry,
and immediately wipes that document's MK/private key/access token through the
existing local expiry action. Peer Port loss and React effect teardown do not
expire an independently valid own session. No manual group event is emitted by
this document cleanup. Both transports use the common encrypted handoff and own
Identity/session coordinator. Chromium has limited real Identity/MK/Entry evidence;
the complete browser/expiry/mismatch matrix and final review remain open.


A verified manual unlock acknowledges only the prior lock reported by an
independent authenticated own-session read, after pending local closing intents
are flushed and before sharing authorization. This RAM-only checkpoint belongs
to the captured own key generation; it is not an unlock root and never enables
handoff or activity renewal. If sharing authorization fails (including429),
rootless repair may ignore only that same link's already acknowledged lock.
Every higher invalidation, logout, missing/different link and retired own key
generation remains effective. Persisted link observations and peer hints cannot
supply this checkpoint. No key, proof or checkpoint is added to durable storage.
