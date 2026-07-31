# Security: CSP, headers & token storage

This doc is the deep reference for the web panel's browser-side security posture.
Quick rules live in `AGENTS.md` under **Security**; the details are here.

## Content-Security-Policy & security headers

The CSP is delivered as **HTTP response headers** from `public/_headers`
(Cloudflare Pages / Netlify `_headers` format). Vite copies `public/` verbatim
into `dist/`, so the file ships with every build but is **not** enforced by Vite
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
| `script-src` | `'self' https://accounts.google.com https://*.gstatic.com` | App bundle + `/init-theme.js` are self; Google Identity script; Firebase compat scripts the SW `importScripts` from gstatic. **No `unsafe-inline`/`unsafe-eval`.** |
| `connect-src` | `'self'` + API hosts + `accounts.google.com` + `*.posthog.com` + `*.googleapis.com` + `www.gstatic.com` + `*.s3.eu-west-1.amazonaws.com` + `wss:` | XHR/fetch to the API, PostHog, FCM registration (`*.googleapis.com`), the SRI `fetch()` of the Firebase scripts (`www.gstatic.com`), the presigned `PUT` icon uploads to S3 (`*.s3.eu-west-1.amazonaws.com` — bucket in `eu-west-1`, name injected server-side so wildcarded; tighten to the exact bucket once known), and SignalR WebSocket (`wss:`). |
| `frame-src` | `https://accounts.google.com` | Google sign-in iframe/popup. |
| `img-src` | `'self' data: blob: https://assets.palladin.io` | Direct catalog icons from the one trusted delivery origin, inline data URIs, and `blob:` local encrypted-icon previews. Arbitrary HTTPS image origins remain blocked. |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | Tailwind + our pervasive inline `style={{}}` attributes need `unsafe-inline`; Google Fonts stylesheet. |
| `font-src` | `'self' https://fonts.gstatic.com` | Google Fonts / Material Symbols. |
| `worker-src` | `'self'` | The FCM service worker. |
| `frame-ancestors` | `'none'` | Clickjacking protection (paired with `X-Frame-Options: DENY`). |
| `object-src` | `'none'` | No plugins. |
| `base-uri` | `'self'` | Block `<base>` hijacking. |
| `form-action` | `'self'` | Forms can only submit to our own origin. |

Companion headers in the same file: `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`Strict-Transport-Security` (2-year, `includeSubDomains; preload`),
`Permissions-Policy` (geolocation/mic/camera off).

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
