# Universal / Android App Links — deployment gate

Both the web panel and landing build emit these same-host assets:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

The association must be published on the actual host that issues `/share/*` links.
Publishing it only on a different landing host does not associate panel links.
Landing associations do not implement a landing receiver route.

Supply all four build variables together, or leave all empty:

| Variable | Value |
| --- | --- |
| `PALLADIN_APP_LINK_ENVIRONMENT` | `staging` or `production` |
| `PALLADIN_APP_LINK_APPLE_APP_ID` | approved 10-character Team ID + dot + bundle ID |
| `PALLADIN_APP_LINK_ANDROID_PACKAGE` | approved Android package |
| `PALLADIN_APP_LINK_ANDROID_SHA256` | comma-separated signing-certificate SHA-256 fingerprints |

Empty configuration emits empty associations, never Palladin-owned runnable defaults.
Partial/malformed configuration fails the build. The environment label is not proof
that the IDs/certificates belong to that environment: deployment review must compare
them independently with the signed native application and its configured domains.
No private signing material belongs in these variables or repository history.

iOS paths are limited to `/share/*` and `/verify-email`. Android uses the standard
app-links relation; corresponding native intent filters still constrain paths.
Before release, verify each deployed URL returns 200, JSON, no redirect/HTML fallback,
then test cold/warm links on physical iOS and Android devices for each host.
Static build tests do not establish native provisioning or deployed acceptance.

Optional web build variables `VITE_APPLE_APP_STORE_URL` and `VITE_GOOGLE_PLAY_STORE_URL`
provide a platform-specific store fallback. Only clean official-store URLs are accepted;
no share key, bearer, query tracking or install referrer is appended. Platform detection
does not claim the application is installed. No store URL is configured by default.

Automatic browser receipt remains the owner-approved flow, with secrets masked.
Installing/opening an application after browser receipt does not yet transfer that
session. In particular, reopening a one-receipt link is not a safe native handoff.
Account creation/login/unlock continues in the original browser document using RAM
and the existing receipt, never persistent plaintext or keys. Closing/reloading the
document loses this continuation; its original 15-minute deadline is not extended.
