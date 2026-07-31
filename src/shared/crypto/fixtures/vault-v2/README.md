# Vault protocol 2 test vectors

These deterministic, synthetic fixtures are committed with the web client so
protocol conformance tests run in every clone and fork without private
repository access.

The files were imported byte-for-byte from the public
[`Palladin-io/palladin-protocol`](https://github.com/Palladin-io/palladin-protocol)
fixture set at commit `6f39860acc680cec3318e9cdf2eeaeb55be77532`. The test
suite pins the SHA-256 digest of `manifest.json`, and the manifest pins every
JSON vector.

Fixture keys, nonces, passwords, identifiers, and plaintexts are test data.
They must never be imported by production code or used as examples of secure
random generation. Production cryptographic code always uses the platform
CSPRNG.

Protocol changes require a reviewed replacement fixture version; do not edit
expected ciphertext, signatures, or AAD values by hand.
