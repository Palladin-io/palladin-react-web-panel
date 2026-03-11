# Claw Vault — Web Panel

React SPA for managing vaults, entries, agents, and grants. Zero-knowledge architecture — all encryption/decryption happens client-side.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Build | Vite | No SSR — pure SPA |
| Framework | React 19 + TypeScript | Strict mode enabled |
| Styling | Tailwind CSS v4 | Utility-first, no CSS modules |
| Routing | TanStack Router | Type-safe file-based routing |
| Server State | TanStack Query | Caching, polling, SignalR-driven invalidation |
| Client State | Zustand | Crypto keys in memory, UI state |
| Forms | React Hook Form + Zod | Validation for entries, grants, import wizard |
| Crypto | libsodium-wrappers | WASM (~200KB), lazy-loaded |
| Real-time | @microsoft/signalr | Grant approval push, browser extension bridge |
| Auth | OAuth 2.0 PKCE redirect | Google, Apple, X providers |
| HTTP | ky | Lightweight fetch wrapper with interceptors |
| Icons | Lucide React | Consistent icon set |
| Toasts | Sonner | Non-blocking notifications |

## Project Structure

```
src/
  app/                    # App shell, providers, router
  features/               # Feature modules (vertical slices)
    auth/                  # OAuth login, session management
    onboarding/            # Master password setup, recovery key backup
    unlock/                # Master password unlock screen
    recovery/              # Recovery key flow
    dashboard/             # Dashboard with vault list, pending grants badge
    vaults/                # Vault CRUD, entry management, import wizard
    agents/                # Agent list, detail, edit
    grants/                # Grant creation, pending approvals
    audit/                 # Audit log viewer, CSV export
    billing/               # Plan & billing, upgrade prompts
    teams/                 # Team management, member roles (Teams+)
    api-keys/              # Org API key management
    settings/              # Account settings, data export, deletion
  shared/
    api/                   # API client, interceptors, types
    crypto/                # libsodium wrappers, key management
    hooks/                 # Shared React hooks
    components/            # Shared UI components
    lib/                   # Utilities, constants
    types/                 # Shared TypeScript types
```

## Architecture Rules

### Feature Modules (Vertical Slices)
- Each feature owns its components, hooks, queries, and types
- Features import from `shared/` — never from other features
- Export only through `index.ts` barrel file

### Crypto Layer (`shared/crypto/`)
- All encryption/decryption logic lives here — nowhere else
- Keys (MK, private key, VK) exist **only in JS memory** (Zustand store)
- Never persist keys to localStorage, sessionStorage, or IndexedDB
- Closing the tab destroys all keys — this is by design
- libsodium WASM is lazy-loaded on first crypto operation

### State Management
- **Zustand** for client-only state: unlocked keys, UI preferences
- **TanStack Query** for server state: vaults, entries, grants, audit logs
- Never duplicate server state in Zustand

### API Client
- Base URL from env: `VITE_API_URL`
- JWT attached via `Authorization: Bearer` header (interceptor)
- 401 responses trigger token refresh or redirect to login
- Agent endpoints are not used from web panel

### Real-time (SignalR)
- Single hub connection managed in a provider
- Used for: pending grant notifications, browser extension bridge events
- On `GrantPending` event → invalidate grants query + show toast
- On `GrantApproved`/`GrantDenied` → invalidate grants query

## Conventions

### TypeScript
- Strict mode, no `any`
- Use `interface` for object shapes, `type` for unions/intersections
- Zod schemas as single source of truth for form validation + API response parsing

### Components
- Functional components only
- Co-locate component, hook, and test files
- Props interfaces named `{ComponentName}Props`
- Use composition over prop drilling

### Styling
- Tailwind utility classes directly on elements
- Extract repeated patterns into components, not CSS classes
- Design tokens via Tailwind theme config (colors, spacing, typography)
- Dark mode support via Tailwind `dark:` variant

### Error Handling
- TanStack Query `onError` for API errors
- Error boundaries per feature route
- User-facing errors: toast (transient) or inline message (form validation)
- Never expose raw API errors to users

### Security
- Strict CSP: no inline scripts, no eval
- SRI hashes for external scripts (libsodium WASM)
- No secrets in env vars except API URL
- Sanitize all user-provided content before rendering

## Analytics (PostHog)

Follow the convention from root `CLAUDE.md`:

```
fe:{module}:{event}
```

Frontend tracks **UI-only** events — page views, wizard interactions, clicks. Business logic events are tracked by backend.

Examples:
```
fe:auth:login-page-viewed
fe:dashboard:viewed
fe:vault:create-wizard-opened
fe:vault:import-wizard-completed
fe:billing:upgrade-prompt-shown
```

## Testing

- **Framework:** Vitest + @testing-library/react + @testing-library/jest-dom
- **Run tests:** `npm test` (single run), `npm run test:watch` (watch mode), `npm run test:coverage` (with coverage)
- Co-locate test files next to components: `Component.test.tsx`
- Test setup in `src/test/setup.ts`

## CI/CD

GitHub Actions workflow at `.github/workflows/test.yml` runs on PRs to `main`:
1. `npm ci`
2. `npm run build`
3. `npm test`

**All changes must go through PRs** — CI must pass before merging.

## Environments

| Environment | `VITE_API_URL` | Mode |
|-------------|---------------|------|
| Local | `http://localhost:5000` | `development` |
| Staging | `https://api.stage.clawvault.io` | `staging` |
| Production | `https://api.clawvault.io` | `production` |

Build per environment: `vite build --mode staging` loads `.env.staging`.

## Environment Variables

```env
VITE_API_URL=http://localhost:5000        # Backend API base URL
VITE_POSTHOG_KEY=phc_xxx                  # PostHog project key
VITE_POSTHOG_HOST=https://app.posthog.com # PostHog instance URL
VITE_SIGNALR_HUB_URL=http://localhost:5000/hubs/notifications
```

Files: `.env.example` (committed template), `.env.local` / `.env.staging` / `.env.production` (gitignored).

## Key Flows

### Unlock Flow
1. User enters master password
2. Derive MK via Argon2id (salt fetched from `/account`)
3. Decrypt `encrypted_private_key` with MK → `user_private_key`
4. Store keys in Zustand (memory only)
5. Navigate to dashboard

### Entry Encryption
1. Get VK: `user_private_key` → decrypt `wrapped_VK` → VK
2. Serialize entry as typed JSON (`{ type, ...fields }`)
3. Encrypt with VK via `crypto_secretbox`
4. Send `{ label, type, encrypted_blob, nonce, url_domain? }` to API

### Grant Approval (FULL)
1. Decrypt VK using user's private key
2. Fetch agent's public key from backend
3. `agent_wrapped_VK = crypto_box_seal(agent_public_key, VK)`
4. POST approve with wrapped key + policy params

### Grant Approval (GRANULAR)
1. Decrypt VK → decrypt entry → plaintext
2. Generate random DEK
3. Re-encrypt plaintext with DEK
4. `agent_wrapped_DEK = crypto_box_seal(agent_public_key, DEK)`
5. POST approve with wrapped DEK + re-encrypted blob
