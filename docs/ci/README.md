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
- optional `STAGING_VITE_PUBLIC_ASSET_URL`, `STAGING_VITE_POSTHOG_*`, and
  `STAGING_VITE_FIREBASE_*` values.

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
