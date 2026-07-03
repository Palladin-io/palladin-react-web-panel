# Feature: auth

**Path:** `src/features/auth/`

## What it does
The entry point to the app: OAuth 2.0 login via `@react-oauth/google`'s **implicit token flow** (Google primary, Apple/X provider buttons are stubbed). Google returns an `access_token` in the browser, which we POST to `/api/auth/oauth/google` to trade for an app JWT and establish the session every other feature depends on. Note: this is the implicit-token flow, not an auth-code/PKCE redirect — the backend has no code-exchange endpoint today. If server-side code exchange is added, switch `useGoogleLogin` to `flow: 'auth-code'`.

Session-token storage: the access token is kept **in memory only** (never persisted); only the refresh token is persisted (localStorage) so a reload can silently restore the session via the ky client's 401→refresh path. Idle + absolute session timeouts (`useSessionTimeout`) wipe the keys and access token on walk-away. Moving the refresh token to an httpOnly cookie is a backend-coordinated follow-up.

## How it's organized
A single login page (rotating tagline, glass provider buttons) backed by one login hook that performs the token exchange and writes the result into the app-wide auth store. No TanStack Query — auth is pure client session state.

## Key patterns
- **Auth-surface conventions:** dark gradient background + `class="dark"` on the outer div; `AppWordmark` + `AuthSubmitButton` for the hero.
- **`useAuthStore` (Zustand) is the session source of truth:** JWT, userId, orgId, permission bits, `isVaultLocked`. Session mutations write straight to Zustand, not through queries.

## Cross-feature deps
`useAuthStore` is consumed by **every** feature for JWT, permissions, and lock state — the one acceptable cross-cutting store. Route guards key off its `isVaultLocked` / `isOnboarded` flags.
