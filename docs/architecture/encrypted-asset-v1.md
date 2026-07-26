# Encrypted presentation asset container v1

Vault protocol 2 presentation icons use a compact binary container. All integers are unsigned big-endian. UUIDs are the 16 RFC 4122 bytes. The maximum icon plaintext is 2 MiB and the maximum decoded dimension is 2048 px.

| Offset | Bytes | Field |
|---:|---:|---|
| 0 | 8 | ASCII `PLDNV2AS` |
| 8 | 2 | container version = `1` |
| 10 | 2 | Vault protocol version = `2` |
| 12 | 2 | algorithm suite = `1` (XChaCha20-Poly1305) |
| 14 | 2 | target: Vault = `1`, Entry = `2` |
| 16 | 2 | media type: JPEG = `1`, PNG = `2`, WebP = `3` |
| 18 | 2 | reserved = `0` |
| 20 | 4 | key version |
| 24 | 4 | Member key generation |
| 28 | 16 | AssetId |
| 44 | 16 | EntryId, or all zeroes for Vault target |
| 60 | 24 | fresh nonce |
| 84 | remaining | AEAD ciphertext and 16-byte tag |

The 32-byte AEAD key is derived with the Vault protocol 2 HKDF purpose `encrypted-asset` (`5`). Vault assets use VK with resource kind `1`; Entry assets use EntryDEK with resource kind `2` and the EntryId.

AAD is the exact concatenation below, without lengths or separators:

1. ASCII `PLDNV2AA`
2. u16 AAD version `1`
3. OrganizationId (16 bytes)
4. VaultId (16 bytes)
5. AssetId (16 bytes)
6. target (u16)
7. EntryId (16 bytes), or zeroes for Vault target
8. media-type enum (u16)
9. key version (u32)
10. Member key generation (u32)

The authenticated media type must equal the backend metadata. Clients reject unknown/reserved fields, scope or generation mismatch, non-matching file signatures, corrupt image decoding and oversized ciphertext before displaying anything. Downloads are length- and SHA-256-verified before AEAD decryption. Decrypted bytes and derived keys are cleared best-effort; every generated object URL is revoked on replacement, lock or unmount.
