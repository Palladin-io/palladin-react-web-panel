# Shared-unlock provider fixture

`session-api-v1.json` is an unchanged copy from
[Palladin protocol PR #13](https://github.com/Palladin-io/palladin-protocol/pull/13),
merge `0a70644fe3fbdeba49d77a8509ec27c449a1d4fa`,
`contracts/shared-unlock/v1/session-api-fixtures.json`.
All values are deterministic synthetic data, including invalid placeholder tokens.
SHA-256: `c14b1755721cda377321128c23d5ec4bd96885f7e77ffb445cedbfc6e0a9373e`.
Gitleaks exempts only this exact file from its generic-api-key heuristic, matching
the existing deterministic-vector policy; other detection rules remain enabled.

The current Web adapters exercise both preference responses, all four authorization
responses, both operation responses and all 32 commit response shapes (40 of 47
variants). The seven link responses remain for the upcoming coordinator; no link
consumer conformance or end-to-end browser handoff is claimed by these tests. Identity remains the
authority for its domain invariants; Web tests enforce contract compatibility
without adding duplicate runtime response validators.
