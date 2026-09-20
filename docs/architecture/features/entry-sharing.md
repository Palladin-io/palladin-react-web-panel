# Individual Entry sharing — CVT-644 (in progress)

The approved scope is the independently encrypted snapshot in CVT-644, not
shared-Vault membership or an Agent grant. Backend lifecycle endpoints exist on
the coordinated feature branch. The web sender form and list now call those
endpoints. The public guest receiver now opens and decrypts a snapshot through
the separate recipient API. Save-copy, auth/native handoff and device acceptance
are still pending. This feature is not deployed or accepted end-to-end.

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

The mounted receiver owns its session and decoded content. Account changes,
crypto-session changes (including lock/logout), unmount, pagehide and expiry
abort transport and discard content. StrictMode's cleanup/reattach must not wipe
the same mounted capability; real unmount disposes it. A late decryption failure
cannot clear a newer incoming link. In-document link replacement and intentional
limit=1 login/app handoff still require integration. Never put these buffers,
the full link or plaintext in a query or
mutation cache, redirect, local/session storage, IndexedDB, telemetry or errors.
Crypto validation errors intentionally discard Zod details and secret input.

## Sender surfaces and API lifecycle

Entry Detail has a separate Sharing tab. `sharing/entry-sharing-tab.tsx` queries
only structural link metadata in cursor pages, polls every 30 seconds while
mounted and discards its Query cache on unmount. Delivery counters/timestamps
and client confirmation are separate. Unknown server states remain visible with
a neutral fallback rather than failing the list or guessing a mutation. Revoke
requires a confirmation explaining that downloaded copies cannot be recalled.
Account, organization, permission or crypto-session changes close the scoped
surface; a late revoke response cannot toast or refresh another session.

`CreateEntryShareDialog` uses ModalShell/DialogFooter and shared form controls.
It decrypts the saved current MemberSecret on demand, masks all field previews,
requires acknowledgement of the included title/selected fields, and defaults to
one named email, email OTP, no additional secret, 24-hour expiry, one receipt and
no Inbox notification. Additional password or at least six ASCII PIN digits is
optional. Notes/TOTP/custom fields stay off until selected; changing selection
resets acknowledgement. Script source stays inert. Recipient email is delivery
metadata, not part of the secret snapshot. Palladin emails only the OTP; the
sender distributes the full link and any additional secret separately.

Creation calls the authoritative challenge before sealing and compares its
revision with the selected current head. A mismatch schedules Member sync repair
and never posts the stale snapshot. Mutations use an explicit allowlisted body;
the decryption key and plaintext cannot be spread into the request. These are
typed first-party API contracts, not duplicated runtime business validators.

The creation operation is component-owned RAM, not a TanStack mutation cache.
An ambiguous create failure retains the exact encrypted request, bearer and key
for an explicit idempotent retry; controls stay disabled so the retry cannot
quietly change its recipient or policy. Cancelling loses that local capability;
the UI warns to revoke any committed link from the list. Successful creation
shows a masked, copyable link once, then drops the snapshot and temporary key
buffers. Closing, locking, changing the session or pagehide disposes the operation
and aborts pending transport. JavaScript strings are released, not claimed to be
securely overwritten. Editing the source displays the non-synchronizing-copy
warning and directs the sender to Sharing for revocation.

## Public guest receiver

`/share/$shareId` is outside the authenticated layout; `/share` explains an invalid
or missing capability. Merely rendering either route makes no recipient request.
Continue in browser explicitly opens a session but neither sends OTP nor consumes
a receipt. Named-recipient email verification and optional password/PIN have
separate forms and proofs. The server remains authoritative for all gates.
Unknown future mode/protection values cannot enable a guessed receipt path.

`recipient-api.ts` uses an independent POST-only transport: no account bearer,
cookies, auth refresh, automatic retry, redirect or referrer. Every body is an
explicit projection; the decryption key is never submitted. HTTP and JSON-decoding
errors discard response/request diagnostics. Session and delivery metadata are
typed first-party contracts, not duplicate runtime business schemas. Delivery's
explicit coordinates and the independently requested share ID feed the existing
AEAD verification before content becomes visible.

`use-share-reception.ts` retains the session only in component-owned RAM. An
ambiguous OTP issuance retries its exact generation before explicit resend can
advance it. An ambiguous delivery retries the same session, enabling the server's
idempotent receipt contract without a second opening. A local session deadline
uses wall and monotonic time and cannot exceed the ingress deadline. Failed or
cancelled verification never satisfies a gate; late responses cannot publish
after ownership changes.

Receive entry is explicit and enabled only after the known gates. Fields start
masked, use shared reveal/copy controls, and render inert text (including Script,
URLs and TOTP seed URIs). React confirms display only after committing the decoded
view. Failed confirmation retains the copy and offers a confirmation-only retry;
it neither repeats delivery nor claims a human read the data. Authorized recipient
termination requires a confirmation dialog, ends the whole link and wipes local
link key/bearer buffers, but does not remove an already displayed local copy until
the session is cleared/expires. No remote recall or external-password change is
implied.

The current receiver does not yet expose save-to-Vault, account continuation or
native handoff. These remain required parts of the epic, not removed scope.

## Verification and remaining work

Focused tests cover projection defaults/explicit opt-in, excluded source data,
all AAD coordinates, independent requested share binding, tampered key/nonce/
ciphertext, native fixture interoperability, Unicode/whitespace preservation,
payload limits, canonical link parsing and URL/RAM lifecycle.

Sender tests additionally exercise field review, optional PIN and notification,
exact-request retry, source revision repair, authenticated organization binding,
lock/unmount/BFCache cleanup, list/revoke states and late mutation responses.
API projection tests prove accidental key/plaintext properties are not submitted.
Mocked HTTP tests do not establish deployed provider/consumer compatibility.

Receiver tests combine the real crypto fixture with mocked public API slices and
exercise both gates, delivery/OTP/confirmation retries, delayed responses, scope
substitution, clock rollback/suspended timers, pagehide, actual unmount and
StrictMode. Page tests prove receipt is explicit, content is masked and the ACK
is issued after the view exists, with confirmation retry and termination dialog.
Transport tests prove no account auth or hidden retry and generic HTTP/JSON errors.

There is still no save-copy or account/native continuation.
Completion requires real HTTP contracts, browser/native acceptance, Inbox/audit
presentation and the verified test environment. A synthetic visual fixture is
only a design aid, never a delivered user test environment.
