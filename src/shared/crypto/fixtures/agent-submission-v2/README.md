# Synthetic Agent submission payload v2 fixture

Vendored byte-for-byte from the coordinated Palladin protocol v2 draft fixture:
https://github.com/Palladin-io/palladin-protocol/tree/feat/cvt-641-submission-v2/contracts/agent-submission/v2

Regenerate through that contract's `generate-fixture.mjs`, never edit the JSON by hand. It intentionally reuses synthetic v1 identities and wrapping keys, with deterministic v2 encrypted content and signatures for approver key versions 1 and 2. It contains no production secrets. Never use fixture keys or nonces outside conformance tests.
