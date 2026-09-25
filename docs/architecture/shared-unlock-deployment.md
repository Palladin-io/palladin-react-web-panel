# Shared unlock deployment

The staging artifact requires `STAGING_VITE_SHARED_UNLOCK_EXTENSION_ID` to be a
reviewed Chromium extension ID. The release job rejects missing or malformed IDs
before building. Generic local/fork builds may leave the optional ID empty.

The extension build independently requires its exact API/panel pair in
`VITE_SHARED_UNLOCK_ENVIRONMENTS` (`CWS_SHARED_UNLOCK_ENVIRONMENTS` in the store
workflow). Setting its server URL does not enable shared unlock. Both settings
are build-time configuration; changing GitHub variables does not repair existing
artifacts. Store and local development identities may differ. Verify the installed
identity before selecting the Web recipient; never infer it from a page message.

For staging, configure the reviewed extension ID in Web, configure the staging
API/panel pair in the extension, rebuild both and verify automatic unlock from a
fresh manual extension unlock. Account OFF, explicit disconnect and expired own
authority must still prevent transfer. Never clear those barriers to repair a
deployment mismatch.
