# Shared unlock deployment

The staging artifact requires `STAGING_VITE_SHARED_UNLOCK_EXTENSION_ID` to be a
reviewed Chromium extension ID. The release job rejects missing or malformed IDs
before building. Generic local/fork builds may leave the optional ID empty.

The extension independently authorizes an exact API/panel pair saved through its
own connection settings. A build-time environment list or API URL alone does not
authorize a panel. Store and local development identities may differ. Verify the
installed identity before selecting the Web recipient; never infer it from a page
message.

The cookie-based Web session requires HTTPS and a same-site API/panel deployment
with exact API CORS origins and credentials enabled. HTTP Web session restoration
is no longer supported, even where an extension connection independently permits
HTTP. See [security](security.md) for local HTTPS setup. Deploy the additive
browser endpoints before deploying this Web client. Native extension/mobile/CLI
JSON auth endpoints remain available during and after the cutover.

For staging, configure the reviewed extension ID in Web, configure the staging
API/panel pair in the extension, deploy the matching artifacts and verify automatic unlock from a
fresh manual extension unlock. Account OFF, explicit disconnect and expired own
authority must still prevent transfer. Never clear those barriers to repair a
deployment mismatch.

After merging a staging configuration change, confirm that the push workflow
builds and deploys the new `main` commit. GitHub Actions skip directives in a
squash commit message suppress that workflow, leaving the previous Web artifact
on staging even when the pull-request checks passed.
