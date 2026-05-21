# Claw Vault — Web Panel

React SPA for managing vaults, entries, agents, and grants. Zero-knowledge architecture — all encryption/decryption happens client-side.

## Project Brain

Wiedza biznesowa i architektoniczna projektu: `../docs/obsidian/claw-vault/`

Kluczowe noty dla tego repozytorium:
- `Technical/Frontend.md` — stack, struktura, konwencje kodu
- `Technical/Analytics Conventions.md` — PostHog, format zdarzeń
- `Technical/Security Model.md` — zero-knowledge, szyfrowanie client-side
- `Product/Modules/Vault/` — Vault module: reguły, API, eventy
- `Product/Modules/Identity/API.md` — endpointy auth i account

Użyj `/brain` żeby nawigować po brain lub: `grep -r "SŁOWO" ../docs/obsidian/claw-vault --include="*.md"`

**Po sesji która zmienia API, architekturę lub reguły biznesowe: zaktualizuj odpowiednią notę w brain.**

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
| i18n | i18next + react-i18next | ARB-style JSON, `en.json` + `pl.json` |

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
- **No dead code:** never ship exported components that have zero importers — remove them or keep them unexported until the dependent feature lands. Unused 300-line components inflate diffs and mislead reviewers.

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

### Route Guards
- **Prefer non-persisted Zustand state for security-critical routing.** `isVaultLocked` is never persisted — it always starts `true` on page load and is only set `false` by `unlockVault()`. This makes it reliable regardless of localStorage corruption or stale JWT claims. Persisted fields like `isOnboarded` can drift and cause false-positive redirects.
- **`beforeLoad` is sync-only.** It fires at navigation time but does NOT react to mid-session state changes. For mid-session redirects (e.g., vault locking while the user is on a protected page), add a `useEffect` in the layout component watching the relevant Zustand field.
- Pattern: `beforeLoad` guards entry, `useEffect` in layout guards mid-session.

### Two-Step Resource Creation
When creating a resource that requires a server-assigned ID before a secondary asset can be uploaded (e.g., vault icon needing `vaultId` for S3 presign), use this pattern:
1. Create the resource with a placeholder/default for the asset.
2. After creation succeeds and you have the ID, upload the real asset and PATCH the resource.
3. Use `blob:` URLs (via `URL.createObjectURL`) for local preview during step 1 — never upload to S3 without an ID.

### Dark-Mode Forced Pages
Pages with a hardcoded dark gradient background (e.g., `/unlock`, `/login`) must add `class="dark"` to their outermost container div. This ensures CSS variables (`--cv-input-bg`, `--cv-input-text`, etc.) resolve to their dark-mode values regardless of the user's app theme toggle — because these pages always render on a dark background.

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

### Shared Interactive Styles

Hover/focus effects for interactive cards and list rows use the shared constant from `src/shared/lib/styles.ts`:

```ts
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
```

Editing `HOVERABLE_CARD_CLASSES` updates the hover border effect everywhere (vault cards, entry rows, future list items) in one place. Never inline custom `hover:border-*` or `shadow-*` on card-like interactive elements.

### Modal Footer Button Pattern

All modals/dialogs that have a Cancel + primary action use a **1:2 flex ratio** row — never `justify-center` or `justify-end`:

```tsx
<div className="mt-1 flex items-center gap-2">
  <Button variant="subtle" size="sm" onClick={onClose} className="flex-1">
    {t('vault.cancel')}
  </Button>
  <Button variant="accent" size="sm" type="submit" disabled={!canSubmit} className="flex-[2]">
    {t('...')}
  </Button>
</div>
```

Rules:
- Container: `mt-1 flex items-center gap-2` — no border-top (that's for detail-page card footers, not modals)
- Cancel: `variant="subtle"`, `size="sm"`, `className="flex-1"` (occupies 1/3)
- Primary: `variant="accent"`, `size="sm"`, `className="flex-[2]"` (occupies 2/3)
- `size="sm"` always (not `md`) for modal footers — matches the app-wide button standard (`+ Add Entry` reference)
- Apply to: create dialogs, icon browser, any ModalShell with confirm/cancel

### Validation & Notifications

**Three distinct layers — never mix them:**

| Layer | Trigger | Component | Location |
|-------|---------|-----------|----------|
| Field validation | `onBlur` (on leave) | `FieldFeedback` below the input | Inline, animated |
| Backend errors | `onError` callback | `toast.error(message)` | Top-right toast |
| Backend success | `onSuccess` callback | `toast.success(message)` | Top-right toast |

**Rules:**
1. **Never use `required` or `type="url"` HTML attributes** — they trigger browser native validation bubbles which are unstyled and inconsistent. Remove them and handle validation manually.
2. **Field validation fires on `onBlur`** — not on submit, not on change. Set error state on blur, clear it on change.
3. **Shared validators live in `src/shared/lib/validation.ts`** — use `required(message)`, `validUrl(message)`, `maxLen(n, message)`, `firstError(value, validators)`. Never write inline validation logic.
4. **`FieldFeedback` is for field-level errors only** — never use it to display API success/error results.
5. **All API results → Sonner toast** — `toast.error(t('key'))` in `onError`, `toast.success(t('key'))` in `onSuccess`. Toaster is mounted once in `Providers` at `position="top-right"`.
6. **No inline `<p>` error elements** — remove any `<p className="text-[11px] text-[#FF4F4F]">` or state-driven error JSX for API errors. Use toast instead.

**URL validation pattern:**
```tsx
const [urlError, setUrlError] = useState(false)

<FormInput
  value={url}
  onChange={(e) => { setUrl(e.target.value); setUrlError(false) }}
  onBlur={() => {
    if (url.trim()) {
      try { new URL(url.trim()); setUrlError(false) }
      catch { setUrlError(true) }
    }
  }}
/>
<FieldFeedback visible={urlError} color="red">
  {t('validation.invalidUrl')}
</FieldFeedback>
```

**Required field pattern:**
```tsx
const [nameError, setNameError] = useState(false)

<FormInput
  value={name}
  onChange={(e) => { setName(e.target.value); setNameError(false) }}
  onBlur={() => setNameError(name.trim().length === 0)}
/>
<FieldFeedback visible={nameError} color="red">
  {t('validation.required')}
</FieldFeedback>
```

### Shared Form Components

Always use shared components — never inline-style raw `<input>` or `<textarea>`:

| Use case | Component | Import |
|----------|-----------|--------|
| Text / URL / email with label | `FormInput` | `shared/components/form-field` |
| Password with show/hide toggle | `SecretInput` | `shared/components/secret-input` |
| Multi-line textarea with label | `FormTextarea` | `shared/components/form-textarea` (add `monospace` for code/key fields) |

All share `text-[12px]`, `border-[var(--cv-input-border)]`, `focus:border-[var(--cv-t1)]`.

### Styling
- Tailwind utility classes directly on elements
- Extract repeated patterns into components, not CSS classes
- Design tokens via CSS variables in `src/index.css` (`:root` for light, `.dark` for dark) — never hardcode hex colors inline in components; use `var(--cv-*)` tokens
- Dark mode: `@custom-variant dark (&:is(.dark *))` — the `dark:` prefix applies when element is inside a `.dark` ancestor. The `ThemeSync` provider toggles `dark` on `document.documentElement`.
- **Design fidelity:** before implementing any UI component, check `docs/design/astro/src/components/` for the Astro reference. Match 1:1 — shape (e.g., `rounded-[10px]` not `rounded-full`), background alphas, border styles (dashed vs solid), icon colors. Deviations from design prototypes are blocking review findings.

#### Accepted deviations from Astro reference (do NOT flag as blocking)

These are intentional UX improvements approved by the product owner. PR review agents must not treat them as violations:

| Area | Deviation | Reason |
|------|-----------|--------|
| Card shadows | `dark:shadow-*` only — no shadow in light mode | Avoids visual heaviness in light theme |
| Hover effect | Light: subtle box-shadow lift (`0_4px_14px_rgba(0,0,0,0.07)`); Dark: shadow + border change | Border-only change too harsh on white background |
| Entry detail pickers | Icon + Color pickers side-by-side (`flex-row`) | Prototype shows them stacked; side-by-side saves vertical space |
| Premium colors | `#D4820A` light / `#F0C040` dark (aligned to Astro tokens) | Prototype used off-spec values; tokens are now the source of truth |

### i18n / Localisation

**Stack:** `i18next` + `react-i18next`

| File | Purpose |
|------|---------|
| `src/locales/en.json` | English strings (template) |
| `src/locales/pl.json` | Polish translations |

**Rules:**
1. **Never hardcode user-facing strings** — add to both JSON files and reference with `t('key')`
2. Use `useTranslation()` in functional components; `i18n.t('key')` in non-component contexts
3. Key naming: `feature.actionOrLabel` (dot-separated, camelCase within namespace) — e.g. `auth.loginTitle`, `vault.createTitle`
4. Both `en.json` and `pl.json` must be updated together
5. Dynamic values use interpolation: `t('key', { count: n })` with `{{count}}` in the JSON value

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

**`analytics.capture(module, event, properties?)` automatically prefixes `fe:`.** Never include the prefix in the call — `capture('unlock', 'page-viewed')` sends `fe:unlock:page-viewed` to PostHog.

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

### Required coverage for interactive forms
Every new form/dialog that ships in a PR must have at minimum:
1. **Render smoke** — component mounts and shows expected labels/fields
2. **Happy path** — successful submit calls the mutation + fires expected analytics + closes/navigates
3. **Error state** — mutation failure surfaces an inline error message

Mock strategy: use a real `QueryClient` in a wrapper, mock the feature hook (`useCreateVault`, `useUpdateVault`, etc.) at the module level with a controllable `mutateMock` that drives `onSuccess`/`onError`. Mock analytics with `vi.fn()`. Stub heavy sub-components (icon picker, color picker) if they'd require their own deep mocks.

Components with no importers must NOT ship — remove them before opening a PR.

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
