# Palladin Web Panel

The browser client for Palladin, a zero-knowledge password manager for people
and AI agents. The panel manages accounts, encrypted vaults and entries,
members, agents, grants, notifications, and audit history.

This repository contains the React single-page application. A compatible
Palladin API is required for account and synchronization flows.

## Security model

Palladin treats the browser as the cryptographic boundary:

- Master passwords and plaintext vault contents are not sent to the API.
- Master keys, member private keys, vault keys, and entry keys live in memory
  only. Locking the vault or closing the tab destroys them.
- Password-based key derivation uses the registered Argon2id profile and
  domain-separated keys. Vault protocol 2 uses authenticated, versioned
  envelopes built with libsodium and HKDF-SHA-256.
- The API stores ciphertext, authenticated structural metadata, and public key
  material needed for synchronization and sharing.
- Cryptographic operations are isolated in `src/shared/crypto/`. Feature code
  consumes that boundary rather than implementing cryptography itself.
- Decrypted member projections are kept in memory. The member-sync cache may
  persist ciphertext and structural cursors, never plaintext or raw keys.

The implementation fails closed on unknown protocol versions, invalid
authentication data, stale key generations, and mismatched resource context.
Deterministic synthetic protocol vectors are committed under
`src/shared/crypto/fixtures/` so the complete conformance suite runs in forks
without access to another repository.

Browser security headers and the current token-storage boundary are documented
in [`docs/architecture/security.md`](docs/architecture/security.md). Please use
GitHub's private vulnerability reporting instead of a public issue for a
suspected security problem.

## Technology

- React 19 and TypeScript
- Vite and Tailwind CSS
- TanStack Router and TanStack Query
- Zustand for client-only state
- libsodium-wrappers for client-side cryptography
- Vitest and Testing Library

The architectural index and feature-specific implementation notes live in
[`docs/architecture/`](docs/architecture/README.md).

## Local development

Requirements:

- Node.js 22
- npm
- a compatible Palladin API, normally at `http://localhost:5000`

```bash
git clone https://github.com/Palladin-io/palladin-react-web-panel.git
cd palladin-react-web-panel
npm ci
cp .env.example .env.local
npm run dev
```

Set the required `VITE_API_URL`, `VITE_SIGNALR_HUB_URL`, and
`VITE_GOOGLE_CLIENT_ID` values in `.env.local`. The Google Web Client ID must
match `Modules:Identity:Google:ClientId` in the local backend configuration.
`npm run dev` stops with an actionable error when a required value is missing;
the browser also renders a configuration error instead of a blank page.

The remaining variables in `.env.example` enable optional integrations such
as analytics and Firebase web push. Set `VITE_PUBLIC_ASSET_URL` explicitly to
your immutable asset namespace to enable catalog icons; an empty value disables
external catalog images and does not select a Palladin-owned service. Vite exposes every `VITE_*` value to the
browser, so these variables must contain public client configuration only -
never service credentials or private keys.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create the production bundle in `dist/` |
| `npm run preview` | Serve the production bundle locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |

Build-time modes can be selected with Vite, for example
`npm run build -- --mode staging`. Keep `.env.local`, `.env.staging`, and
`.env.production` out of version control.

## Repository structure

```text
src/
  app/                 application shell, providers, and router
  features/            vertical feature modules
  shared/api/          typed API client and shared contracts
  shared/components/   reusable UI controls
  shared/crypto/       cryptographic implementation and protocol fixtures
  shared/lib/          non-cryptographic utilities
docs/architecture/     current architecture and security notes
public/_headers        deploy-time browser security headers
```

## Contributing

Open changes against `main`. CI installs the locked dependency graph, audits
dependencies, builds the application, and runs the complete test suite without
repository secrets. Security-sensitive changes should include explicit tests
for rejection and cleanup paths as well as the happy path.

Keep `AGENTS.md` and `CLAUDE.md` byte-for-byte identical when updating project
conventions.

## License and trademarks

The software is licensed under the [Apache License 2.0](LICENSE). Contributions
must follow [the DCO](DCO) and [contribution guide](CONTRIBUTING.md). Third-party
components retain their own licenses; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The software license does not grant rights to Palladin names, logos, or app
icons. See [`TRADEMARKS.md`](TRADEMARKS.md).
