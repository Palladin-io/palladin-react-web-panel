# Feature: auth

**Path:** `src/features/auth/`

## What it does
OAuth 2.0 PKCE login (Google via `@react-oauth/google`, plus Apple/X provider buttons). `LoginPage` shows a rotating tagline and glass provider buttons; on success it exchanges the OAuth access token for an app JWT and establishes the session.

## Key components / hooks / queries
- `LoginPage` — login surface (`AppWordmark` lg, `AuthSubmitButton`, glass provider buttons).
- `use-login.ts` — exchanges OAuth token → JWT, writes session to `useAuthStore`.
- `useAuthStore` (Zustand) — **app-wide session primitive**: JWT, userId, orgId, permission bits, `isVaultLocked`.

## Patterns
- Auth-surface page: `AUTH_BACKGROUND_GRADIENT` + `class="dark"` on the outer div.
- No TanStack Query — session mutations write directly to Zustand.

## Cross-feature deps
- `useAuthStore` is imported by **every** feature for JWT / permissions / lock state. This is the one acceptable cross-cutting store.
