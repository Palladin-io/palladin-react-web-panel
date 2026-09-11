# Shared-unlock provider fixture

`session-api-v1.json` is an unchanged copy from
[Palladin protocol PR #13](https://github.com/Palladin-io/palladin-protocol/pull/13),
merge `0a70644fe3fbdeba49d77a8509ec27c449a1d4fa`,
`contracts/shared-unlock/v1/session-api-fixtures.json`.
All values are deterministic synthetic data, including invalid placeholder tokens.

The current Web manual-source adapter exercises both preference responses and
all four authorization response shapes. The remaining operation/commit/link
variants are retained in the exact shared fixture for the upcoming coordinator;
they are not yet claimed as Web consumer conformance. Identity remains the
authority for its domain invariants; Web tests enforce contract compatibility
without adding duplicate runtime response validators.
