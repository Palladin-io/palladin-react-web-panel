# Vault v2 plaintext schemas

Status: **Accepted cross-client freeze**.

These are the plaintexts carried inside canonical Vault v2 envelopes. Every
document is UTF-8 RFC 8785 JCS, has an exact schema discriminator, rejects
duplicate JSON properties and unsafe numbers, and uses a closed top-level
schema. Unknown `AgentFieldAccess` values always fail closed and never enter an
Agent projection.

## Stable field identifiers

Built-in IDs are protocol constants, not translated labels:

```text
memberLabel, agentLabel, description, icon, color, entryType,
key.value, credential.username, credential.password, credential.url,
credential.urlDomain, credential.totp, notes,
script.source, script.interpreter, script.refs,
custom:<uuid>
```

`agentFieldAccess` values are exactly: `never`, `discovery`, `onGrantValue`,
`onGrantDerived`, `onGrantRuntime`. Custom-field policy keys use immutable field
IDs, never labels.

## MemberVaultMetadata v1

Encrypted under the VK-derived metadata key. `grantMode` remains Member-only
product configuration because it disappeared from structural backend state.

```json
{
  "schema": "palladin.member-vault-metadata.v1",
  "name": "Personal",
  "description": "optional",
  "icon": { "kind": "glyph", "value": "lock" },
  "color": "semantic-token-or-null",
  "grantMode": "full"
}
```

Rules: `name` is required and bounded; every optional known value uses explicit
`null` and every array is explicit (including empty); `grantMode` is the closed
`full | granular` union.
Remote icon URLs are forbidden. Encrypted asset references get a separate
closed object variant after `PLDNV2AS` lands.

## MemberIndex v1

Small Member-only list/search projection. It contains no password, key value,
TOTP seed, Notes, script body, refs, or concealed custom value.

```json
{
  "schema": "palladin.member-index.v1",
  "entryType": "credential",
  "memberLabel": "GitHub work",
  "description": "optional",
  "icon": { "kind": "glyph", "value": "key" },
  "color": null,
  "username": "patryk@example.com",
  "urlDomain": "github.com",
  "customIndex": [
    { "id": "custom:uuid", "label": "Tenant", "value": "Acme" }
  ]
}
```

`username`/`urlDomain` exist only for Credential. `customIndex` admits only
non-concealed text explicitly chosen for Member list/search. Search derives its
tokens locally from these values; no duplicated `searchTerms` field is stored.

## MemberSecret v1

Canonical complete Entry state. MemberIndex, AgentDiscovery, and GrantPayload
are pure local projections of this document.

```json
{
  "schema": "palladin.member-secret.v1",
  "entryType": "credential",
  "memberLabel": "GitHub work",
  "agentLabel": "GitHub work account",
  "description": "optional",
  "icon": { "kind": "glyph", "value": "key" },
  "color": null,
  "content": {
    "username": "patryk@example.com",
    "password": "secret",
    "url": "https://github.com/login",
    "urlDomain": "github.com",
    "totp": null,
    "notes": null,
    "customFields": []
  },
  "agentFieldAccess": {
    "agentLabel": "discovery",
    "entryType": "discovery",
    "credential.username": "discovery",
    "credential.urlDomain": "discovery",
    "credential.password": "onGrantValue",
    "credential.url": "onGrantValue",
    "credential.totp": "onGrantDerived",
    "notes": "onGrantValue"
  }
}
```

`content` is a closed discriminated union:

- `key`: `value`, `notes`, `customFields`;
- `credential`: `username`, `password`, `url`, `urlDomain`, `totp`, `notes`,
  `customFields`;
- `script`: `source`, `interpreter`, `refs`, `notes`, `customFields`.

Every built-in field has exactly one policy entry. Each existing custom field
has exactly one `custom:<uuid>` policy entry and no orphan policy keys exist.
Type-specific constraints from the ADR reject unsafe modes (for example Script
source cannot be `onGrantValue`; TOTP cannot expose the seed through Discovery).

## AgentDiscovery v1

Only fields whose canonical policy is `discovery`; never presentation assets or
Member-only labels.

```json
{
  "schema": "palladin.agent-discovery.v1",
  "entryType": "credential",
  "agentLabel": "GitHub work account",
  "capabilities": ["get", "exec"],
  "fields": [
    { "id": "credential.urlDomain", "value": "github.com" },
    { "id": "credential.username", "value": "patryk@example.com" }
  ]
}
```

`fields` are distinct and sorted by field-ID ASCII bytes. The projector rejects
an attempted value whose MemberSecret policy is not exactly `discovery`.

## GrantPayload v1

Short-lived, grant-specific projection. It carries only approved field IDs and
their allowed result mode. Its descriptor independently binds methods, expiry,
remaining uses, field-set commitment, Entry revision, recipient and Grant ID.

```json
{
  "schema": "palladin.grant-payload.v1",
  "entryType": "credential",
  "fields": [
    { "id": "credential.password", "kind": "concealed", "mode": "value", "value": "secret" },
    { "id": "credential.totp", "kind": "totp", "mode": "derived", "value": { "secret": "JBSWY3DPEHPK3PXP", "algorithm": "SHA1", "digits": 6, "period": 30, "issuer": null, "account": null } }
  ]
}
```

Allowed payload modes are exactly `value`, `derived`, `runtime`; kinds are
exactly `text`, `multiline`, `concealed`, `url`, `totp`, `script`,
`interpreter`, `refs`. They map from
`onGrantValue`, `onGrantDerived`, `onGrantRuntime`. `never` and `discovery` do
not automatically authorize a grant value. Field IDs are distinct, sorted, and
must exactly match the outer `fieldIds` plus its `PLDNV2FS` commitment.

## Frozen validation rules

- All strings are NFC. Colors are `null` or uppercase `#RRGGBB`.
- Optional known fields are explicit `null`; arrays are always present.
- `customIndex` is capped at 20 and contains only text/multiline values, never
  concealed values or TOTP material.
- AgentDiscovery serializes capabilities because its consumer does not receive
  the full Member policy. GrantPayload does not: descriptor `ApprovedMethods`
  is authoritative.
- Unknown custom kinds may be preserved opaquely during read, but any Agent
  projection or mutation involving them fails closed. A client must not rewrite
  a changed MemberSecret it cannot safely understand.
- TOTP uses uppercase unpadded Base32 plus the closed algorithm, 6/8 digits,
  bounded period and explicit nullable issuer/account. Script refs use
  `{env,vaultId,entryId,fieldId}` and never address a mutable label.
