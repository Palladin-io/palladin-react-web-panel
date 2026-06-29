# Feature: auth

**Path:** `src/features/auth/`

## What it does
The entry point to the app: OAuth 2.0 PKCE login (Google primary, Apple/X provider buttons). On a successful provider exchange it trades the OAuth token for an app JWT and establishes the session every other feature depends on.

## How it's organized
A single login page (rotating tagline, glass provider buttons) backed by one login hook that performs the token exchange and writes the result into the app-wide auth store. No TanStack Query — auth is pure client session state.

## Key patterns
- **Auth-surface conventions:** dark gradient background + `class="dark"` on the outer div; `AppWordmark` + `AuthSubmitButton` for the hero.
- **`useAuthStore` (Zustand) is the session source of truth:** JWT, userId, orgId, permission bits, `isVaultLocked`. Session mutations write straight to Zustand, not through queries.

## Cross-feature deps
`useAuthStore` is consumed by **every** feature for JWT, permissions, and lock state — the one acceptable cross-cutting store. Route guards key off its `isVaultLocked` / `isOnboarded` flags.
