# Continuous integration

The `Test` workflow is the required pull-request check for `main`. It is
designed to run safely for contributions from forks:

1. check out only the pull-request repository;
2. install the exact dependency graph with `npm ci`;
3. fail on high or critical dependency advisories;
4. type-check and build the production bundle;
5. run the complete Vitest suite, including vendored cryptographic protocol
   vectors.

The workflow needs only read access to repository contents. It does not receive
repository secrets, check out private repositories, or use
`pull_request_target`.

## Staging release and deployment

After a successful push to `main`, the same `Test` workflow rebuilds the tested
source revision with staging configuration, creates a deterministic web bundle
and SPDX SBOM, records their SHA-256 digests, and publishes GitHub artifact
attestations. A separate least-privilege job then downloads that exact artifact,
verifies the checksums and source revision, and deploys the prebuilt directory
atomically to Netlify. It never rebuilds after the CI gates have passed.

The deploy job uses the protected GitHub `staging` environment. Configure it
with:

- environment secret `NETLIFY_AUTH_TOKEN`;
- environment variable `NETLIFY_SITE_ID`.

The browser-visible build configuration is kept in repository variables so the
artifact can be built by the attestation job without granting that job access to
the Netlify credential:

- `STAGING_VITE_API_URL=https://api.stage.palladin.io`;
- `STAGING_VITE_SIGNALR_HUB_URL=https://api.stage.palladin.io/hubs/notifications`;
- `STAGING_VITE_GOOGLE_CLIENT_ID`;
- `STAGING_VITE_SHARED_UNLOCK_EXTENSION_ID`,
  `STAGING_VITE_SHARED_UNLOCK_FIREFOX_EXTENSION_ID`, and
  `STAGING_VITE_SHARED_UNLOCK_SAFARI_EXTENSION_ID` for each enabled browser's
  reviewed staging extension installation;
- `STAGING_VITE_CLIENT_ANALYTICS_RELEASED=true` for the approved live panel
  analytics release, together with `STAGING_VITE_POSTHOG_KEY` for the selected
  project and `STAGING_VITE_POSTHOG_HOST=https://eu.i.posthog.com`;
- optional `STAGING_VITE_PUBLIC_ASSET_URL` and
  `STAGING_VITE_FIREBASE_*` values.

Client analytics stays disabled when its release flag is empty or `false`.
A `true` flag requires both a nonempty project key and the exact EU capture host;
other flag values fail the artifact build. The owner currently routes the live
staging panel to the production EU PostHog project (decision 2026-09-19).
Store its public capture key only in deployment variables, never repository
defaults. A saved, current account consent is still required at runtime.
Changing these build variables requires a new artifact deployment.

Shared-unlock IDs are public browser recipient identifiers, not secrets or
attestation of installed code. The staging artifact job passes them explicitly
to the corresponding `VITE_SHARED_UNLOCK_*` build values. Templates remain
empty; an omitted ID leaves that browser's channel disabled. Configure each ID
only after checking it against the intended installed extension and its exact
staging Web/API mapping. A successful build with an omitted ID is not shared
unlock acceptance. Pull-request jobs receive none of these staging values.

The workflow rejects a staging API or SignalR URL that does not match the
canonical staging host. It also embeds the source commit in
`deploy-metadata.json`; post-deploy smoke tests compare that value on both the
Netlify deploy URL and `https://stage.palladin.io`, then verify that a direct
request to `/login` is rewritten to the SPA and receives the security headers.
The workflow-level concurrency policy cancels stale runs so an older commit
cannot replace a newer deployment.

The presence of `public/_headers` in a bundle does not itself apply security
headers. Deployment infrastructure must serve those entries as HTTP response
headers; see [`../architecture/security.md`](../architecture/security.md).
