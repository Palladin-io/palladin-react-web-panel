# Palladin — Web Panel

React SPA for managing vaults, entries, agents, and grants. Zero-knowledge architecture — all encryption/decryption happens client-side.

## Architecture Reference Docs

**Reuse-first rule:** before building any control, check the catalog. If a shared component covers the case, use it. If a pattern appears **2+ times**, extract it into `src/shared/components/` instead of copy-pasting markup.

- **Full control catalog** (every shared component + props + controls still to extract + reuse rules): `docs/architecture/component-catalog.md`.
- **Architecture index:** `docs/architecture/README.md`.
- **Organization member identity resolution:** `docs/architecture/member-directory.md`. Audit and immutable history use this single organization-scoped, memory-only current/former member cache; never add per-row identity requests or use the Team member payload as the shared resolver.

**Before implementing in a feature, read its architecture doc first** — it lists existing components, hooks, queries, patterns, and cross-feature deps so you extend rather than duplicate.

| Feature | Doc |
|---------|-----|
| Auth | `docs/architecture/features/auth.md` |
| Onboarding | `docs/architecture/features/onboarding.md` |
| Unlock | `docs/architecture/features/unlock.md` |
| Recovery | `docs/architecture/features/recovery.md` |
| Vaults & Entries | `docs/architecture/features/vaults.md` |
| Agents | `docs/architecture/features/agents.md` |
| Grants | `docs/architecture/features/grants.md` |
| Audit | `docs/architecture/features/audit.md` |
| API Keys | `docs/architecture/features/api-keys.md` |
| Notifications | `docs/architecture/features/notifications.md` |
| Settings | `docs/architecture/features/settings.md` |
| Teams | `docs/architecture/features/teams.md` |

`billing/` is not yet implemented and remains a placeholder directory.

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
| Auth | OAuth 2.0 implicit token (`@react-oauth/google`) | Google active; Apple/X stubbed. Google returns an `access_token` client-side, POSTed to `/api/auth/oauth/google` for the app JWT. No code-exchange/PKCE endpoint on the backend today — revisit if one lands. |
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

### Scroll Model — pinned chrome, internal scroll (app-wide)

**The page never scrolls as a whole on list/split views — only the content section scrolls.** Canonical reference: entry detail (`/vaults/:id/entries/:entryId`) and `VaultEntriesPanel`.

- **Pattern:** panel root = `flex h-full min-h-0 flex-col`; chrome (header row, tab bar, search, filters) gets `shrink-0`; the list/content section is wrapped in the shared **`ScrollArea`** (`src/shared/components/scroll-area.tsx`) — `flex-1 min-h-0 overflow-y-auto` with the `.subtle-scrollbar` styling baked in. Never hand-roll this wrapper.
- **Split-view columns:** both columns get `overflow-hidden` when the panel inside manages its own scroll (list panels), or `subtle-scrollbar overflow-y-auto` when the content is a plain detail/form. Page container: `flex h-full overflow-hidden`.
- **Scrollbars:** never show a native fat scrollbar — every scrollable region uses `.subtle-scrollbar` (defined in `src/index.css`, `--cv-*` tokens). `<main>` in `_authenticated.tsx` already has it.
- **Pagination:** paginated lists auto-load via `useInfiniteScroll` (sentinel + IntersectionObserver, `EntriesLoadMore` as reference); a manual "Load more" button appears only as the error-retry fallback.

### View Layout (new views)

- New views are **left-aligned** with the standard `panel-content` container (padding `px-4 py-4`), consistent with Agents/Vaults. **Never center** view content (`mx-auto` / `justify-center` at the page level is forbidden).
- **Prefer split-view** for views with a list + related context: main list on the left (`w-[clamp(...)] shrink-0 border-r`), related panel on the right (`flex-1`). On narrow screens the columns stack vertically (list first). This split-view layout is duplicated across 7 pages and is a candidate for a shared `SplitView` component — see `docs/architecture/component-catalog.md`.
- Patterns to copy (don't invent a new one): Grant Management (list + detail), Approvals (pending left + audit log right), Agents/Vaults. Keep the existing pattern from `agents-page.tsx` / `grants-page.tsx`.

### Shared Interactive Styles

Hover/focus on interactive cards and list rows uses `HOVERABLE_CARD_CLASSES` from `src/shared/lib/styles.ts` (background lift via `--cv-card-hover`, no shadow, no border change). Never inline `hover:border-*` / `hover:bg-*` / `shadow-*` on card-like elements — route them through the constant. Details in `docs/architecture/styling.md`.

### Dialogs / Modal Footers

When building or editing a modal/dialog, read `docs/architecture/dialogs.md` (ModalShell + DialogFooter, the 1:2 button ratio, single-height `size="sm"` buttons).

### Forms, Validation & Inline Edit

When building a form, wiring field validation, or implementing an inline-edit detail panel, read `docs/architecture/forms-and-validation.md` (shared field components, the 3-layer validation/notification model, raw-input class string, inline-edit `canEdit` pattern).

Quick rule: never inline-style a raw `<input>`/`<textarea>` — use `FormInput`, `SecretInput`, or `FormTextarea`. Inline field errors use `FeedbackSlot` (`onBlur`, animated/self-collapsing — never the fixed-height `+ -mb-4` pattern); API results use Sonner toasts — never mix the two.

### Shared controls inventory

Every-iteration reuse reference. Reach for the shared component before writing markup. Full props and proposed APIs in `docs/architecture/component-catalog.md`.

| Control | Component | When to use |
|---------|-----------|-------------|
| Text / URL / email input | `FormInput` | Any labelled single-line field |
| Password input | `SecretInput` | Secrets with show/hide; masks via `.secret-mask`, never `type=password` |
| Textarea | `FormTextarea` | Multi-line; `monospace` for code/keys |
| Select / dropdown | `FormSelect` | Native `<select>` styling with chevron; pass `<option>`s as children |
| Button | `Button` | All buttons; always `size="sm"` |
| Modal | `ModalShell` + `DialogFooter` | Any dialog; see `dialogs.md` |
| Detail tabs | `VaultDetailTabs` (canonical); **extract** `DetailTabBar` | Detail-view tab strips; 4 divergent copies exist |
| Card / list-row hover | `HOVERABLE_CARD_CLASSES` | Any interactive card/row; never inline hover classes |
| Internal scroll section | `ScrollArea` | Any scrollable list/content region under pinned chrome; see Scroll Model |
| Skeleton / loader | **missing** → `SkeletonBlock` | Loading placeholders; 22 inline copies — extract |
| Empty state | **missing** → `EmptyState` | "No items" dashed box; 13 inline copies — extract |
| Responsive master/detail | `ResponsiveMasterDetail` | Wide list + detail columns with narrow route-driven drill-in |
| Tooltip | `Tooltip` | Truncated text; 150ms delay, only when actually clipped |
| Icon | `Icon` | Material Symbols glyph; never hand-write `<span class="mi">` |
| Filter dropdown | `TypeFilterDropdown` | Multi-select filter (checkbox listbox + Clear) |
| Date/time picker | `DateTimePicker` | Date/time selection; never native `datetime-local` |
| Inline field feedback | `FeedbackSlot` (canonical) / `FieldFeedback` | Inline validation messages; prefer `FeedbackSlot` (animated, self-collapsing). See `forms-and-validation.md` |
| Password generator | `PasswordGeneratorPopover` | In-field "generate" affordance for secret inputs; via `SecretInput`'s `onGenerate`. See `forms-and-validation.md` |
| Error panel | `ErrorState` | Failed-query panel with Retry |
| Route error boundary | `ErrorBoundary` | Wrap feature routes |
| Password strength | `PasswordStrengthBar` | Master-password fields |
| Auth CTA / wordmark | `AuthSubmitButton` / `AppWordmark` | Auth surfaces only |

Items marked **missing** are duplicated 2+ times with no shared component — extract on next touch rather than adding another copy.

### Styling
- Tailwind utility classes directly on elements; extract repeated patterns into components, not CSS classes.
- **Never hardcode hex/rgba in components — always use `var(--cv-*)` tokens.**
- When styling anything beyond trivial layout (tokens, dark-mode mechanics, hover helpers, radius/spacing conventions, adding a token), read `docs/architecture/styling.md` — the full styling guide with the complete `--cv-*` token list and the `styles.ts` helpers.

#### Semantic UI density

- Choose typography and geometry by **semantic role**, not by copying a nearby pixel value: use `text-micro`, `text-meta`, `text-action`, `text-ui`, `text-heading-*`, `h-action`, `h-control`, and `w-sidebar`.
- Do not add arbitrary `text-[Npx]`, fixed pixel dimensions for standard controls, CSS `zoom`, or `transform: scale()`. Context-specific dimensions use `rem`; reusable roles get a token in `src/index.css` and documentation in `docs/architecture/styling.md`.
- All list/global searches use the shared `SearchBar` and `--cv-search-bg`; do not assemble search fields from raw `<input>` markup. Form controls remain on `--cv-input-bg` so editable data stays visually distinct.
- Informational text must not render below `text-micro` (12px). Buttons use `size="sm"` / `h-action` with `text-action`; inputs and search controls use `h-control` with `text-ui`.

#### Brand/Primary Red

The brand/primary red lives ONLY in CSS tokens — never hardcode `#FF4F4F`, `rgba(255,79,79,…)`, or `#E04545` in components.

| Token | Value | Use |
|-------|-------|-----|
| `--cv-primary` | `#EB4747` | Solid color (text, borders, backgrounds) |
| `--cv-primary-hover` | `#D43E3E` | Hover state |
| `--cv-primary-rgb` | `235 71 71` | Alpha tints via `rgb(var(--cv-primary-rgb) / 0.12)` |

In Tailwind arbitrary values: `text-[var(--cv-primary)]`, `bg-[rgb(var(--cv-primary-rgb)/0.12)]`.
In inline JS styles: `'var(--cv-primary)'`, `'rgb(var(--cv-primary-rgb) / 0.12)'`.

Audit Log event colors → see `docs/architecture/features/audit.md`.

#### No forced UPPERCASE

Never force all-caps on UI text — no `uppercase` Tailwind class and no `text-transform: uppercase`. Render labels, section headers, chips, badges, and buttons in the exact case written in the i18n string (sentence/label case). All-caps hurts readability and is a recurring review finding. The **only** approved exception is the established `WarningZone` amber title; do not introduce new uppercase surfaces without an explicit request.

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
- **CSP delivered as HTTP headers** via `public/_headers` (Cloudflare/Netlify format) — NOT a `<meta>` tag, and NOT enforced by Vite. It is the single source of truth for the allow-list and MUST be updated whenever the app talks to a new external origin. Full rationale + directive-by-directive breakdown: `docs/architecture/security.md`.
  - `script-src` is `'self'` + Google Identity + `*.gstatic.com`; there is **no `unsafe-inline`/`unsafe-eval` for scripts** (the theme bootstrap is an external `/init-theme.js`). `style-src` DOES allow `'unsafe-inline'` — Tailwind and our inline `style={{}}` attributes require it.
- **SRI is enforced on the Firebase compat scripts** the service worker loads (`public/firebase-messaging-sw.js`) via a pinned-SHA-384 `fetch(url, { integrity })` guard before `importScripts`. (libsodium WASM is bundled by Vite, not loaded as an external script, so it needs no SRI.)
- **Tokens:** the access token lives in memory only (never persisted); only the refresh token is persisted to localStorage, pending a backend-coordinated move to an httpOnly cookie. See `src/features/auth/stores/auth-store.ts`. Idle + absolute session timeouts (`useSessionTimeout`) wipe keys + access token on walk-away.
- No secrets in env vars except API URL + public Firebase/OAuth config
- Sanitize all user-provided content before rendering

## Analytics (PostHog)

Follow the convention from root `AGENTS.md`:

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
2. `npm run lint`
3. `npm run build`
4. `npm test`

**All changes must go through PRs** — CI must pass before merging.

## Environments

| Environment | `VITE_API_URL` | Mode |
|-------------|---------------|------|
| Local | `http://localhost:5000` | `development` |
| Staging | `https://api.stage.palladin.io` | `staging` |
| Production | `https://api.palladin.io` | `production` |

Build per environment: `vite build --mode staging` loads `.env.staging`.

## Environment Variables

```env
VITE_API_URL=http://localhost:5000        # Backend API base URL
VITE_PUBLIC_ASSET_URL=                    # Optional immutable asset origin; validated and injected into img-src CSP at build time
VITE_POSTHOG_KEY=phc_xxx                  # PostHog project key
VITE_POSTHOG_HOST=https://app.posthog.com # PostHog instance URL
VITE_SIGNALR_HUB_URL=http://localhost:5000/hubs/notifications
```

Files: `.env.example` (committed template), `.env.local` / `.env.staging` / `.env.production` (gitignored).

## Key Flows

Crypto / zero-knowledge flows (Unlock, Entry Encryption, Grant Approval FULL & GRANULAR) → see `docs/architecture/key-flows.md`.

## Maintaining this file

This file is **always loaded into context**, so keep it lean. It holds only guidance useful in **every** iteration: project shape, hard rules, conventions, and a navigation layer (the shared-controls inventory + pointers to deep docs).

- **Deep or concern-specific guidance does NOT belong here** — it goes in `docs/architecture/` (e.g. `dialogs.md`, `forms-and-validation.md`, `styling.md`, `component-catalog.md`, `features/*.md`), with a one-line pointer from this file.
- When a section grows verbose code examples, full token tables, or rules only relevant when touching one concern → move it to a sub-doc and leave a pointer.
- Extend this structure autonomously over time: as new every-iteration rules emerge, add them here concisely; as deep detail accumulates, push it down into `docs/architecture/` and link it.
- **PR reviewers must check whether a code change requires updating this file or a `docs/architecture/` doc** (new shared component, changed convention, new feature, new token, changed crypto flow) — doc drift is a review finding.
- `AGENTS.md` and `CLAUDE.md` are intentionally maintained as complete,
  byte-for-byte identical compatibility copies. Every instruction change must
  update both files in the same commit and be verified with `cmp`.
- Repository CI must remain safe for forks: no private checkouts, no secrets in
  pull-request jobs, and no execution of untrusted code through
  `pull_request_target`.
