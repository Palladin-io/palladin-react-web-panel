# Feature: auth

**Path:** `src/features/auth/`

## What it does
The entry point to the app. Two ways in:

- **OAuth 2.0** via `@react-oauth/google`'s **implicit token flow** (Google primary, Apple/X stubbed). Google returns an `access_token` in the browser, POSTed to `/api/auth/oauth/google` for the app JWT. Implicit-token flow, not auth-code/PKCE — no backend code-exchange endpoint today; if one lands, switch `useGoogleLogin` to `flow: 'auth-code'`. OAuth accounts are always `emailVerified: true`.
- **Email + password** uses Identity KDF v2. The browser combines the master password with a user-held 32-byte Account Secret, runs the registered Argon2id profile once, and domain-separates AuthCredential from MK. AuthCredential is sent to the server; password, Account Secret and MK never are. Legacy accounts unlock under the registered legacy profile and must complete an idempotent client-side rewrap migration.

Session-token storage: the access token is kept **in memory only** (never persisted); only the refresh token is persisted (localStorage) so a reload can silently restore the session via the ky client's 401→refresh path. Idle + absolute session timeouts (`useSessionTimeout`) wipe the keys and access token on walk-away. Moving the refresh token to an httpOnly cookie is a backend-coordinated follow-up.

## How it's organized
- **`components/login-page`** — step machine (`credentials` → optional `totp` → optional legacy `migration`). The v2 handshake validates the bootstrap, derives once before TOTP, and verifies the authenticated account KDF state before unlock.
- **`register/`** — credentials, recovery phrase display/confirmation, then Account Secret backup confirmation. `use-register` generates a client AccountId, posts only v2 AuthCredential plus wrapped key material, and lands the user unlocked. Route `/register`.
- **`verify-email/`** — `/verify-email?token=` result screen (verifying / verified / expired / invalid) via `use-verify-email`. `VerifyEmailBanner` (soft, server-authoritative on `account.emailVerified === false`) is pinned in the authenticated layout with a throttled resend (`use-resend-verification`, fires `fe:auth:verification-email-resent`). Verification never hard-blocks the app — the backend gates sensitive actions independently.
- **`security/`** — `SecurityPage` (route `/_authenticated/security`, linked from Settings): change master password (`use-change-master-password` — verify current AuthCredential and rewrap under a fresh-salt MK; recovery phrase untouched) and TOTP 2FA (`use-totp` enroll/confirm/disable; QR via `shared/components/qr-code`, recovery codes shown once).

## Key patterns
- **Auth-surface conventions:** dark gradient + `class="dark"` on the outer div; `AppWordmark` / `AuthSubmitButton` / `AuthStepShell` (shared) for the hero chrome. Master-password fields use `FormInput type="password"` (the browser *should* offer to save the account password), unlike vault secrets which use `SecretInput`.
- **Crypto isolation:** every derive/wrap/unwrap happens in a feature hook calling `shared/crypto` helpers; MK, private key and Account Secret land in Zustand memory only, are excluded from `persist.partialize`, and owned temporary buffers are wiped in `finally`.
- **`useAuthStore` (Zustand) is the session source of truth:** JWT, userId, permission bits, `isVaultLocked`, `isOnboarded`, `emailVerified` (never regresses true→false). Session mutations write straight to Zustand, not through queries.

## Cross-feature deps
`useAuthStore` is consumed by **every** feature for JWT, permissions, and lock state — the one acceptable cross-cutting store. Route guards key off its `isVaultLocked` / `isOnboarded` flags. Registration and onboarding share `shared/lib/create-default-vault-safe` (relocated from onboarding so both entry paths can seed the default vault without a feature→feature import).
