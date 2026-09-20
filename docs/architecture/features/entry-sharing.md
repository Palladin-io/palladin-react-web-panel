# Individual Entry sharing — CVT-644 (in progress)

The approved scope is the independently encrypted snapshot in CVT-644, not
shared-Vault membership or an Agent grant. Backend lifecycle endpoints exist on
the coordinated feature branch. The web sender/receiver surfaces, save-copy
flow, auth/native handoff and device acceptance are still pending.

## Snapshot boundary

`shared/crypto/entry-share-selection.ts` projects a confirmed list of field IDs
from an already authenticated current `MemberSecretV1`. It copies only the title,
Entry type and selected values. It never serializes the source object, original
key material, Agent visibility/grant policy, icon assets, history or Script
references/execution policy. Script source is inert text; sharing it does not
authorize execution or resolve referenced Entries.

Credential username/password/URL, Key value/URL and basic card or Script fields
are initially selected. Description, notes, TOTP, billing address and **all custom
fields** require explicit selection. This also protects recovery codes without
guessing their meaning from a localized custom-field label. Unknown custom types
are reported as unsupported rather than coerced or silently selected. The UI
must show those fields as unavailable and explain why.

The encrypted JSON schema is `palladin.entry-share.v1`:

```json
{
  "schema": "palladin.entry-share.v1",
  "title": "Example",
  "entryType": "credential",
  "fields": [
    { "id": "credential.password", "label": "", "type": "concealed", "value": "example-only" }
  ]
}
```

Types are `key`, `credential`, `script`, `creditCard`. Field types are `text`,
`multiline`, `concealed`, `totp`; values are strings, with TOTP represented as an
`otpauth://totp/` URI containing the selected seed, never a transient generated code.
Native IDs retain their canonical names, custom IDs retain `custom:` identifiers.
Empty native labels are localized by the receiving UI; custom labels are copied.
Snapshot parsing rejects extra properties, duplicate IDs and empty selection.
The source title is always included and must be visible in the sender preview.
Values are not trimmed or Unicode-normalized by the sharing layer.

## Encryption and independent authority

`shared/crypto/entry-share.ts` uses a fresh random 32-byte key and XChaCha20-Poly1305
with a fresh 24-byte nonce. An independently generated random 32-byte access bearer
authorizes the server route; it cannot decrypt the payload. Optional PIN/password
and OTP remain backend gates, not substitutes for the random encryption key.
Nonce and ciphertext use canonical padded base64 in the existing .NET byte-array
contract. Ciphertext including the 16-byte tag is bounded to 262,144 bytes.

AAD is this exact byte concatenation, with no separators or length prefixes:

| Offset | Bytes | Value |
| --- | --- | --- |
| 0 | 18 | ASCII `PLDN-ENTRY-SHARE-v1` |
| 18 | 16 | Share UUID in RFC/network byte order |
| 34 | 16 | Organization UUID |
| 50 | 16 | Vault UUID |
| 66 | 16 | Entry UUID |
| 82 | 8 | Source revision, unsigned big-endian u64 |
| 90 | 8 | Expiry Unix seconds, unsigned big-endian u64 |
| 98 | 4 | Expiry fractional nanoseconds, unsigned big-endian u32 |

UUID text is canonical lowercase. Revisions use canonical decimal strings, never
JS numbers. UTC expiry accepts zero to nine fractional digits, preserves all
nanoseconds and rejects invalid calendar dates. Equivalent textual Instants
produce identical AAD; no Date truncation may change the authenticated expiry.

On creation, scope comes from the selected authenticated organization/route,
current independently decrypted Entry head, server creation challenge and chosen
expiry. The caller must compare the challenge revision with that selected head
before encryption. On receipt, the separately typed canonical delivery fields
are the backend authority for source coordinates; the requested share ID is an
independent input from the selected link and is compared before key use. Scope is
never reconstructed from the encrypted payload being validated. AEAD binds all
canonical delivery fields and rejects scope substitution.

The fixture `src/shared/crypto/fixtures/entry-share-v1.json` was generated using
Python `uuid`/`struct` and native system libsodium, separately from the TypeScript
encoder. It contains only synthetic public test material. Web verifies its exact
AAD and decrypts its ciphertext. Flutter consumption and real cross-client flow
are still release gates, not established by this fixture alone.

## Link ingress and lifecycle

Link path: `/share/{canonical-share-uuid}`. Fragment has exactly this order:
`#v=1&key={32-byte-base64url}&access={32-byte-base64url}`. Both encodings are
unpadded canonical base64url. Duplicate/unknown fields, percent-encoding aliases
and unsupported versions fail closed. No secret is in the path or query string.

`main.tsx` captures an incoming link in RAM and removes its fragment, query and
history state **before** dynamically importing App/router/analytics. An invalid
share path is replaced with `/share`. Failure to scrub the address prevents
application startup. Other routes, including auth fragments, remain unchanged.
The capture code sends no request and never consumes a receipt.

Pending buffers are wiped on pagehide (including BFCache entry), explicit disposal
and a 15-minute in-memory continuation timeout. Read also checks expiry so a
suspended timer cannot return an already expired capability. Reload cannot recover
the secret from storage; the receiver UI must tell the user to reopen the original
link. This local timeout does not change the sender's server-owned link expiry.

Receiver ownership, cancellation on account lock/logout, in-document route
changes, decoded content lifecycle and limit=1 login/app handoff still require
integration. Never put these buffers, the full link or plaintext in a query or
mutation cache, redirect, local/session storage, IndexedDB, telemetry or errors.
Crypto validation errors intentionally discard Zod details and secret input.

## Verification and remaining work

Focused tests cover projection defaults/explicit opt-in, excluded source data,
all AAD coordinates, independent requested share binding, tampered key/nonce/
ciphertext, native fixture interoperability, Unicode/whitespace preservation,
payload limits, canonical link parsing and URL/RAM lifecycle.

This foundation does not yet expose a user-facing Share button or receiver route.
The eventual modal uses existing ModalShell, form fields and semantic tokens;
sender list, create flow and recipient surface remain separate components.
Completion still requires their interactive tests, provider/consumer HTTP
contracts, browser/native acceptance and the verified test environment.
