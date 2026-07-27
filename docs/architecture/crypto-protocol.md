# Crypto protocol boundary

This document describes the web client's target cryptographic boundary for the
pre-production Vault v2 cutover. The accepted source of truth is the
`2026-07-16-vault-entry-zero-knowledge` ADR in the project brain.

## Frozen decisions

- Symmetric payload suite: `palladin-vault-xchacha-v1`.
- Payload AEAD: XChaCha20-Poly1305 IETF (32-byte key, 24-byte fresh nonce,
  16-byte authentication tag).
- Subkey derivation: HKDF-SHA-256 with the canonical `PLDNKDF2` context and an
  absent salt represented as 32 zero bytes. Callers cannot supply salt or a
  free-form context.
- Recipient wrapping: a separately versioned X25519 contract. It is not part of
  the AEAD payload shape.
- Signatures: a separately versioned Ed25519 contract. It is not an encryption
  keypair and must never be substituted for X25519.
- Unknown protocol/suite identifiers fail closed. There is no XSalsa fallback
  or dual-mode decoder.
- Keys exist only in memory and temporary byte copies are wiped where the
  platform permits it.

## Stable descriptor and suite-owned payload

`EnvelopeDescriptor` contains stable structural coordinates: protocol and suite
IDs, purpose, tenant/resource scope, resource revision, key version, and an
optional member-key generation. It contains no nonce, tag, or wrapper fields.

`EncodedSuitePayload` is one bounded opaque byte string. Its internal layout is
owned exclusively by the selected suite. For `palladin-vault-xchacha-v1` the
current layout is:

```text
24-byte nonce || ciphertext || 16-byte Poly1305 tag
```

Backend/domain/API code may store and size-check this payload but must not model
the nonce or tag as universal envelope fields. A future suite may use a
different internal shape without changing the stable descriptor.

## Registry and responsibilities

`src/shared/crypto/crypto-suite.ts` is a compiled-in allowlist, not an
algorithm factory driven by untrusted strings. It owns suite payload validation,
seal, and open. `src/shared/crypto/hkdf.ts` owns HKDF-SHA-256. X25519 recipient
wrapping remains isolated in `vault-key.ts` until the versioned wrapper contract
is extracted; Ed25519 signing will receive its own abstraction when the signed
manifest flow is connected.

`src/shared/crypto/canonical-aad.ts` is the only web encoder for the frozen
`PLDNENV2` binary descriptor contract. It uses big-endian bounded integers,
RFC 4122 UUID byte order, the shared scope bitmap and purpose-specific
extensions. `computeFieldSetCommitment` implements the sorted `PLDNV2FS`
commitment. Vault v2 payloads use canonical base64url without padding.

The HKDF info value is `PLDNKDF2 || protocol || suite || purpose || scope ||
keyVersion || generation?`. It deliberately excludes resource revision and
purpose-specific envelope bindings, allowing one versioned subkey to encrypt
multiple revisions with fresh nonces and revision-bound AAD.

The new suite is covered by primitive and descriptor vectors but is not yet
connected to legacy endpoint payloads. The separate
`palladin-x25519-sealed-box-v1` wrapper will be connected only with its canonical
Rust-produced vector; it must not be replaced by an ad-hoc KDF/wrapper.

## Legacy integration inventory

These paths still use the pre-cutover `(encryptedBlob, nonce)` and/or
`crypto_secretbox` contract and must switch atomically with the backend contract:

- account private-key wrapping remains an explicitly separate Identity follow-up:
  the frozen Vault purpose registry does not define an account-private-key
  purpose, so clients must not invent one during this Vault v2 cutover;
- Vault Key wrapping: vault creation and every entry/grant operation that opens
  the caller's wrapped VK;
- entry create, edit, reveal, import, and export;
- granular grant creation, approval, regrant, and bulk-import grant envelopes;
- all related API types, mocks, fixtures, and key-flow documentation.

Do not connect only one of these paths to the new suite. Development/staging data
may be reset, so the final migration is a breaking cutover with no legacy
decrypt fallback.

## Release gates

Before the suite is connected to product flows:

1. Freeze the canonical descriptor/AAD and encoded payload API contract across
   all four implementations.
2. Publish shared vectors for HKDF inputs/outputs, descriptor bytes, suite
   payload, X25519 wrapping, and Ed25519 transcript signatures.
3. Make every client consume the same vectors and add negative vectors for
   unknown suites, tampering, substitution, bounds, and downgrade attempts.
4. Replace every legacy Vault/Entry/grant call site in one breaking cutover;
   search the shipped Vault/grant source and bundles for
   `crypto_secretbox`/XSalsa. Identity account-private-key wrapping is tracked
   separately and requires its own frozen descriptor before migration.
5. Run build, lint, full tests, and the cross-client compatibility gate.
