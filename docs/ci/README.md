# Continuous integration

The `Test` workflow is the required pull-request check for `main`. It is
designed to run safely for contributions from forks:

1. check out only the pull-request repository;
2. install the exact dependency graph with `npm ci`;
3. fail on high or critical dependency advisories;
4. type-check and build the production bundle;
5. run the complete Vitest suite, including vendored cryptographic protocol
   vectors.

The workflow needs only read access to repository contents. It does not receive
repository secrets, check out private repositories, or use
`pull_request_target`.

## Release artifacts

After a successful push to `main`, `release-artifact.yml` rebuilds the tested
source revision, creates a deterministic web bundle and SPDX SBOM, records
their SHA-256 digests, and publishes GitHub artifact attestations. The release
job is intentionally separate from pull-request CI and receives only the
permissions needed for attestations.

The presence of `public/_headers` in a bundle does not itself apply security
headers. Deployment infrastructure must serve those entries as HTTP response
headers; see [`../architecture/security.md`](../architecture/security.md).
