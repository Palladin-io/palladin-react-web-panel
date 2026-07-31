# Contributing to Palladin Web Panel

Palladin is security-critical. Start with a public issue describing the
problem, threat model, user impact, and proposed tests before opening a
substantial pull request. Report vulnerabilities privately according to
`SECURITY.md`.

## Development changes

Follow the repository conventions in `AGENTS.md` and the architecture notes in
`docs/architecture/`. Keep cryptography inside `src/shared/crypto/`, keep keys
and plaintext secrets out of persistent storage and logs, and do not weaken the
zero-knowledge boundary for convenience.

Every behavioral change must include appropriate positive and negative tests.
Before requesting review, run:

```bash
npm ci
npm run lint
npm run build
npm test
```

If a command exposes an existing unrelated failure, document it precisely in
the pull request rather than hiding it.

## Legal terms

By contributing, you agree that your contribution is licensed under the
license applicable to the files you modify.

Every commit must include a Developer Certificate of Origin sign-off:

    Signed-off-by: Your Name <your.email@example.com>

Add it with `git commit -s`. Do not submit code copied from another project
unless its source, copyright, and license are identified and compatible.

Submitting a contribution does not grant rights to Palladin trademarks.
